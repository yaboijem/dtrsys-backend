# Department & Position Master Data Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace free-text employee department/position with FK master data, an Org structure admin page, and searchable select-only fields on employee create/edit.

**Architecture:** Add `departments` and `positions` tables; migrate existing string values into them and set `employees.department_id` / `position_id`. Admin CRUD mirrors branches (block delete when in use). Web gets `/org-structure` plus a reusable `SearchableSelect`; employee modal and list filter consume the master lists. API resources keep flat `department` / `position` **name strings** for display compatibility while also exposing ids for forms.

**Tech Stack:** Laravel (PHPUnit feature tests, Sanctum, Spatie roles), React + TypeScript admin web (`web/`), Radix Popover (same as `EmployeePicker`), existing `DataTable` / `Modal` / `PageHeader` patterns.

## Global Constraints

- Select-only dropdowns (no free-text invent-on-type) on employee create **and** edit.
- Storage is FKs only after migration (drop string columns).
- Delete department/position blocked while any employee references it (422 + clear code/message).
- Org structure page roles: Super Admin, HR, Branch Manager, Department Head.
- Department/position API routes: `role:Super Admin|HR|Branch Manager|Department Head`.
- Employee write routes stay Super Admin|HR.
- Case-insensitive unique names on master tables (validation).
- YAGNI: no hierarchy, codes, soft-delete, or multi-branch variants.
- Follow TDD: failing test → implement → pass → commit per task.
- Do not commit secrets; do not push unless asked.

---

## File map

| File | Responsibility |
|------|----------------|
| `database/migrations/xxxx_create_departments_and_positions_tables.php` | Create master tables + migrate employee FKs + drop strings |
| `app/Models/Department.php`, `Position.php` | Eloquent models + `employees()` |
| `database/factories/DepartmentFactory.php`, `PositionFactory.php` | Test factories |
| `app/Models/Employee.php` | FKs, `department()` / `position()` relations |
| `app/Http/Controllers/Api/Admin/DepartmentController.php`, `PositionController.php` | CRUD + delete guard |
| `app/Http/Requests/StoreDepartmentRequest.php`, `UpdateDepartmentRequest.php` (and Position twins) | Validation |
| `app/Http/Resources/DepartmentResource.php`, `PositionResource.php` | JSON shape |
| `routes/api.php` | Register routes on correct role group |
| `app/Http/Requests/StoreEmployeeRequest.php`, `UpdateEmployeeRequest.php` | `department_id` / `position_id` |
| `app/Http/Controllers/Api/Admin/EmployeeController.php` | Create/update/filter by id; eager load relations |
| `app/Http/Resources/EmployeeResource.php`, `UserResource.php`, attendance/schedule/fraud resources | Names from relations + ids on employee |
| `app/Support/ScopesByRole.php`, `DashboardController`, `AttendanceAdminController`, `FraudFlagController` | Scope by `department_id` |
| `database/seeders/EmployeeSeeder.php`, `EmployeeFactory.php` | Master rows + FKs |
| `tests/Feature/DepartmentPositionCrudTest.php` | Master CRUD + delete-in-use |
| `tests/Feature/AdminCrudTest.php` and other feature tests | Employee payloads use ids |
| `web/src/components/SearchableSelect.tsx` | Reusable predict-search dropdown |
| `web/src/pages/OrgStructurePage.tsx` | Departments + Positions admin UI |
| `web/src/pages/EmployeesPage.tsx` | Modal + filter use SearchableSelect |
| `web/src/api/types.ts`, `endpoints.ts` | Types + API clients |
| `web/src/App.tsx`, `web/src/components/Layout.tsx` | Route + nav |

---

### Task 1: Migration, models, factories

**Files:**
- Create: `database/migrations/2026_09_16_120000_create_departments_and_positions_tables.php`
- Create: `app/Models/Department.php`
- Create: `app/Models/Position.php`
- Create: `database/factories/DepartmentFactory.php`
- Create: `database/factories/PositionFactory.php`
- Modify: `app/Models/Employee.php`
- Modify: `database/factories/EmployeeFactory.php`
- Test: `tests/Feature/DepartmentPositionMigrationTest.php` (or fold first assertions into Task 2 CRUD test — prefer dedicated migration smoke in Task 2 create flow)

**Interfaces:**
- Produces: `Department` model fillable `['name']`, `hasMany(Employee::class)`; `Position` same; `Employee::department(): BelongsTo`, `Employee::position(): BelongsTo`; columns `department_id`, `position_id` on employees; no string `department`/`position` columns after migrate.

- [ ] **Step 1: Write migration**

```php
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('departments', function (Blueprint $table) {
            $table->id();
            $table->string('name')->unique();
            $table->timestamps();
        });

        Schema::create('positions', function (Blueprint $table) {
            $table->id();
            $table->string('name')->unique();
            $table->timestamps();
        });

        Schema::table('employees', function (Blueprint $table) {
            $table->foreignId('department_id')->nullable()->after('last_name')->constrained()->restrictOnDelete();
            $table->foreignId('position_id')->nullable()->after('department_id')->constrained()->restrictOnDelete();
        });

        // Backfill departments
        $deptNames = DB::table('employees')
            ->whereNotNull('department')
            ->where('department', '!=', '')
            ->distinct()
            ->pluck('department');

        foreach ($deptNames as $name) {
            $trimmed = trim((string) $name);
            if ($trimmed === '') {
                continue;
            }
            $id = DB::table('departments')->whereRaw('LOWER(name) = ?', [mb_strtolower($trimmed)])->value('id');
            if (! $id) {
                $id = DB::table('departments')->insertGetId([
                    'name' => $trimmed,
                    'created_at' => now(),
                    'updated_at' => now(),
                ]);
            }
            DB::table('employees')
                ->where('department', $name)
                ->update(['department_id' => $id]);
        }

        // Backfill positions (same pattern with positions table / position column)
        $posNames = DB::table('employees')
            ->whereNotNull('position')
            ->where('position', '!=', '')
            ->distinct()
            ->pluck('position');

        foreach ($posNames as $name) {
            $trimmed = trim((string) $name);
            if ($trimmed === '') {
                continue;
            }
            $id = DB::table('positions')->whereRaw('LOWER(name) = ?', [mb_strtolower($trimmed)])->value('id');
            if (! $id) {
                $id = DB::table('positions')->insertGetId([
                    'name' => $trimmed,
                    'created_at' => now(),
                    'updated_at' => now(),
                ]);
            }
            DB::table('employees')
                ->where('position', $name)
                ->update(['position_id' => $id]);
        }

        Schema::table('employees', function (Blueprint $table) {
            $table->dropIndex(['branch_id', 'department']);
            $table->dropColumn(['department', 'position']);
            $table->index(['branch_id', 'department_id']);
        });
    }

    public function down(): void
    {
        Schema::table('employees', function (Blueprint $table) {
            $table->dropIndex(['branch_id', 'department_id']);
            $table->dropConstrainedForeignId('department_id');
            $table->dropConstrainedForeignId('position_id');
            $table->string('department')->nullable();
            $table->string('position')->nullable();
            $table->index(['branch_id', 'department']);
        });

        Schema::dropIfExists('positions');
        Schema::dropIfExists('departments');
    }
};
```

Note: If SQLite testing chokes on `dropIndex(['branch_id', 'department'])`, use the actual index name from the original migration or `Schema::hasColumn` guards. Prefer matching how other migrations in this repo alter indexes under sqlite.

- [ ] **Step 2: Models**

`app/Models/Department.php`:

```php
<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Department extends Model
{
    use HasFactory;

    protected $fillable = ['name'];

    public function employees(): HasMany
    {
        return $this->hasMany(Employee::class);
    }
}
```

Mirror for `Position`.

- [ ] **Step 3: Update Employee model**

Replace fillable `department`/`position` with `department_id`/`position_id`. Add:

```php
public function department(): BelongsTo
{
    return $this->belongsTo(Department::class);
}

public function position(): BelongsTo
{
    return $this->belongsTo(Position::class);
}
```

- [ ] **Step 4: Factories**

`DepartmentFactory`: `'name' => fake()->unique()->company()`.  
`PositionFactory`: `'name' => fake()->unique()->jobTitle()`.

`EmployeeFactory`:

```php
'department_id' => Department::factory(),
'position_id' => Position::factory(),
```

Remove string `department`/`position` keys.

- [ ] **Step 5: Run migrate in tests context**

Run: `php artisan test --filter=AdminCrudTest`  
Expected: FAIL (employee create still sends string department / factory may break). That is OK for now if factories are fixed first — then AdminCrud will fail on payload. Prefer:

Run: `php artisan migrate:fresh --env=testing` only if a testing env exists; otherwise proceed to Task 2 tests which use `RefreshDatabase`.

- [ ] **Step 6: Commit**

```bash
git add database/migrations app/Models/Department.php app/Models/Position.php database/factories app/Models/Employee.php
git commit -m "feat(db): departments and positions master tables with employee FKs"
```

---

### Task 2: Department & Position admin API CRUD

**Files:**
- Create: `app/Http/Controllers/Api/Admin/DepartmentController.php`
- Create: `app/Http/Controllers/Api/Admin/PositionController.php`
- Create: `app/Http/Requests/StoreDepartmentRequest.php`, `UpdateDepartmentRequest.php`
- Create: `app/Http/Requests/StorePositionRequest.php`, `UpdatePositionRequest.php`
- Create: `app/Http/Resources/DepartmentResource.php`, `PositionResource.php`
- Modify: `routes/api.php`
- Test: `tests/Feature/DepartmentPositionCrudTest.php`

**Interfaces:**
- Produces:  
  - `GET/POST /api/admin/departments`, `GET/PATCH/DELETE /api/admin/departments/{department}`  
  - Same for `/api/admin/positions`  
  - Resource: `{ id, name, employees_count? }`  
  - Delete 422 body: `{ message, code: 'department_has_employees' | 'position_has_employees' }`

- [ ] **Step 1: Write failing tests**

`tests/Feature/DepartmentPositionCrudTest.php`:

```php
<?php

namespace Tests\Feature;

use App\Models\Department;
use App\Models\Employee;
use App\Models\Position;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\Test;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

class DepartmentPositionCrudTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        foreach (['Super Admin', 'HR', 'Branch Manager', 'Department Head', 'Employee'] as $role) {
            Role::findOrCreate($role, 'web');
        }
    }

    private function makeAdmin(string $role = 'HR'): Employee
    {
        $employee = Employee::factory()->create();
        $employee->user->syncRoles([$role]);

        return $employee;
    }

    #[Test]
    public function hr_can_create_and_list_department(): void
    {
        $admin = $this->makeAdmin();

        $this->actingAs($admin->user, 'sanctum')
            ->postJson('/api/admin/departments', ['name' => 'Engineering'])
            ->assertCreated()
            ->assertJsonPath('data.name', 'Engineering');

        $this->actingAs($admin->user, 'sanctum')
            ->getJson('/api/admin/departments')
            ->assertOk()
            ->assertJsonFragment(['name' => 'Engineering']);
    }

    #[Test]
    public function department_name_must_be_unique_case_insensitive(): void
    {
        Department::factory()->create(['name' => 'IT']);
        $admin = $this->makeAdmin();

        $this->actingAs($admin->user, 'sanctum')
            ->postJson('/api/admin/departments', ['name' => 'it'])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('name');
    }

    #[Test]
    public function department_with_employees_cannot_be_deleted(): void
    {
        $dept = Department::factory()->create();
        Employee::factory()->create(['department_id' => $dept->id]);
        $admin = $this->makeAdmin();

        $this->actingAs($admin->user, 'sanctum')
            ->deleteJson("/api/admin/departments/{$dept->id}")
            ->assertStatus(422)
            ->assertJsonPath('code', 'department_has_employees');
    }

    #[Test]
    public function empty_department_can_be_deleted(): void
    {
        $dept = Department::factory()->create();
        $admin = $this->makeAdmin();

        $this->actingAs($admin->user, 'sanctum')
            ->deleteJson("/api/admin/departments/{$dept->id}")
            ->assertOk();

        $this->assertDatabaseMissing('departments', ['id' => $dept->id]);
    }

    #[Test]
    public function department_head_can_list_departments(): void
    {
        Department::factory()->create(['name' => 'Ops']);
        $dh = $this->makeAdmin('Department Head');

        $this->actingAs($dh->user, 'sanctum')
            ->getJson('/api/admin/departments')
            ->assertOk()
            ->assertJsonFragment(['name' => 'Ops']);
    }

    #[Test]
    public function position_crud_mirrors_department(): void
    {
        $admin = $this->makeAdmin();
        $pos = Position::factory()->create(['name' => 'Clerk']);

        $this->actingAs($admin->user, 'sanctum')
            ->patchJson("/api/admin/positions/{$pos->id}", ['name' => 'Senior Clerk'])
            ->assertOk()
            ->assertJsonPath('data.name', 'Senior Clerk');

        Employee::factory()->create(['position_id' => $pos->id]);

        $this->actingAs($admin->user, 'sanctum')
            ->deleteJson("/api/admin/positions/{$pos->id}")
            ->assertStatus(422)
            ->assertJsonPath('code', 'position_has_employees');
    }
}
```

- [ ] **Step 2: Run tests — expect FAIL**

Run: `php artisan test --filter=DepartmentPositionCrudTest`  
Expected: FAIL (404 / route not found).

- [ ] **Step 3: Implement requests, resources, controllers**

`StoreDepartmentRequest` rules:

```php
'name' => [
    'required',
    'string',
    'max:255',
    Rule::unique('departments', 'name')->where(fn ($q) => $q->whereRaw('LOWER(name) = ?', [mb_strtolower($this->input('name'))])),
],
```

Simpler portable approach used in many codebases:

```php
'name' => ['required', 'string', 'max:255', Rule::unique('departments', 'name')],
```

Plus custom prepare:

```php
protected function prepareForValidation(): void
{
    if ($this->has('name')) {
        $this->merge(['name' => trim($this->input('name'))]);
    }
}
```

And uniqueness rule with `Rule::unique(...)->whereRaw('LOWER(name) = ?', [mb_strtolower($this->input('name'))])` **or** validate with a closure checking `Department::whereRaw('LOWER(name) = ?', [...])->exists()`. Prefer closure for case-insensitive on sqlite+mysql:

```php
'name' => [
    'required', 'string', 'max:255',
    function (string $attribute, mixed $value, \Closure $fail) {
        $exists = Department::whereRaw('LOWER(name) = ?', [mb_strtolower(trim((string) $value))])->exists();
        if ($exists) {
            $fail('The name has already been taken.');
        }
    },
],
```

Update request ignores current id:

```php
$ignoreId = $this->route('department')?->id;
// exists query ->when($ignoreId, fn ($q) => $q->where('id', '!=', $ignoreId))
```

`DepartmentController` mirror `BranchController`:

- `index`: search on name, `withCount('employees')`, orderBy name, paginate max 100  
- `store`/`update`: audit via `AuditService` like branches (`department.created`, etc.)  
- `destroy`: if `$department->employees()->exists()` return 422 with message `Cannot delete: N employees still use this department.` and `code` => `department_has_employees`

Mirror for Position.

- [ ] **Step 4: Register routes**

In `routes/api.php` inside the group:

```php
Route::middleware(['auth:sanctum', 'role:Super Admin|HR|Branch Manager|Department Head'])->prefix('admin')->group(function () {
    // existing attendance/dashboard/schedules...
    Route::apiResource('departments', DepartmentController::class);
    Route::apiResource('positions', PositionController::class);
});
```

Add `use` imports for the new controllers.

- [ ] **Step 5: Run tests — expect PASS**

Run: `php artisan test --filter=DepartmentPositionCrudTest`  
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add app/Http/Controllers/Api/Admin/DepartmentController.php app/Http/Controllers/Api/Admin/PositionController.php app/Http/Requests/StoreDepartmentRequest.php app/Http/Requests/UpdateDepartmentRequest.php app/Http/Requests/StorePositionRequest.php app/Http/Requests/UpdatePositionRequest.php app/Http/Resources/DepartmentResource.php app/Http/Resources/PositionResource.php routes/api.php tests/Feature/DepartmentPositionCrudTest.php
git commit -m "feat(api): department and position admin CRUD"
```

---

### Task 3: Employee API uses department_id / position_id

**Files:**
- Modify: `app/Http/Requests/StoreEmployeeRequest.php`
- Modify: `app/Http/Requests/UpdateEmployeeRequest.php`
- Modify: `app/Http/Controllers/Api/Admin/EmployeeController.php`
- Modify: `app/Http/Resources/EmployeeResource.php`
- Modify: `app/Http/Resources/UserResource.php`
- Modify: `app/Http/Resources/AttendanceAdminResource.php`
- Modify: `app/Http/Resources/ScheduleAdminResource.php`
- Modify: `app/Http/Resources/FraudFlagResource.php`
- Modify: `app/Support/ScopesByRole.php`
- Modify: `app/Http/Controllers/Api/Admin/DashboardController.php`
- Modify: `app/Http/Controllers/Api/Admin/AttendanceAdminController.php`
- Modify: `app/Http/Controllers/Api/Admin/FraudFlagController.php`
- Modify: `database/seeders/EmployeeSeeder.php`
- Modify: `tests/Feature/AdminCrudTest.php`
- Modify: `tests/Feature/AttendanceAdminApiTest.php`
- Modify: `tests/Feature/ScheduleAdminApiTest.php`
- Modify: `tests/Feature/FraudFlagReviewTest.php`
- Modify: `tests/Feature/EmployeeNameSyncTest.php`
- Modify: `tests/Feature/HomeLocationApiTest.php`
- Modify: `tests/Feature/HybridAttendanceTest.php`
- (any other test still setting string `department`/`position` on Employee)

**Interfaces:**
- Consumes: `Department` / `Position` models from Task 1–2  
- Produces: Employee write accepts `department_id`, `position_id`; read returns `department_id`, `position_id`, and string `department`/`position` names; filters `department_id`; Department Head scopes by `department_id`

- [ ] **Step 1: Update AdminCrudTest employee payload (failing)**

In `employeePayload`:

```php
'department_id' => Department::factory()->create(['name' => 'IT'])->id,
'position_id' => Position::factory()->create(['name' => 'Software Engineer'])->id,
```

Remove `department`/`position` strings.

Assert:

```php
$this->assertDatabaseHas('employees', ['department_id' => /* the id used */]);
// response names:
->assertJsonPath('data.department', 'IT')
->assertJsonPath('data.department_id', $deptId)
```

- [ ] **Step 2: Run AdminCrud employee tests — expect FAIL**

Run: `php artisan test --filter=test_hr_can_create_employee`  
Expected: FAIL validation / mass assignment until controller updated.

- [ ] **Step 3: Requests**

`StoreEmployeeRequest`:

```php
'department_id' => ['required', 'integer', 'exists:departments,id'],
'position_id' => ['required', 'integer', 'exists:positions,id'],
```

`UpdateEmployeeRequest`:

```php
'department_id' => ['sometimes', 'integer', 'exists:departments,id'],
'position_id' => ['sometimes', 'integer', 'exists:positions,id'],
```

Remove old string rules.

- [ ] **Step 4: EmployeeController**

- `index`: `->with([..., 'department', 'position'])`  
  Replace department filter:

```php
->when($request->filled('department_id'), fn ($q) => $q->where('department_id', $request->integer('department_id')))
```

- `store` / `update`: use `department_id` / `position_id` instead of strings; `only([...])` list updated.  
- After create/update load `department`, `position`.

- [ ] **Step 5: Resources map names**

`EmployeeResource`:

```php
'department_id' => $this->department_id,
'position_id' => $this->position_id,
'department' => $this->whenLoaded('department', fn () => $this->department?->name, $this->department?->name),
'position' => $this->whenLoaded('position', fn () => $this->position?->name, $this->position?->name),
```

Safer always:

```php
'department' => $this->relationLoaded('department')
    ? $this->department?->name
    : $this->department()?->value('name'),
```

Prefer eager-loading everywhere and:

```php
'department' => $this->department?->name,
'position' => $this->position?->name,
```

`UserResource`:

```php
'department' => $employee->department?->name,
'position' => $employee->position?->name,
'department_id' => $employee->department_id,
'position_id' => $employee->position_id,
```

Ensure auth/me loads `employee.department`, `employee.position`.

`AttendanceAdminResource` / `ScheduleAdminResource` / `FraudFlagResource`: use `$this->employee->department?->name` (and ensure employee relation eager-loads `department`/`position` where listed).

- [ ] **Step 6: Role scoping**

`ScopesByRole`:

```php
if ($user->hasRole('Department Head')) {
    $departmentId = $user->employee?->department_id;
    if (! $departmentId) {
        return $query->whereRaw('1 = 0');
    }
    return $query->whereHas('employee', fn (Builder $q) => $q->where('department_id', $departmentId));
}
```

`DashboardController`: `$employees->where('department_id', $user->employee?->department_id)`

`AttendanceAdminController` filter:

```php
->when($request->filled('department_id'), fn ($q) => $q->whereHas('employee', fn ($q) => $q->where('department_id', $request->integer('department_id'))))
```

Photo access check comparing departments → compare `department_id`.

`FraudFlagController` same id compare.

- [ ] **Step 7: Fix all feature tests that set department/position strings**

Pattern for helpers:

```php
private function makeUser(string $role, ?Branch $branch = null, string $department = 'IT'): Employee
{
    $dept = Department::query()->firstOrCreate(
        ['name' => $department],
        ['name' => $department],
    );
    // firstOrCreate with same name — use:
    $dept = Department::firstOrCreate(['name' => $department]);

    $employee = Employee::factory()->create([
        'branch_id' => $branch?->id ?? Branch::factory(),
        'department_id' => $dept->id,
    ]);
    // ...
}
```

For `Employee::factory()->create(['department' => 'Sales'])` → create/find Sales department and pass `department_id`.

`HomeLocationApiTest` / `HybridAttendanceTest` copying `$employee->department` into payloads: use `$employee->department_id` or name from relation as needed by that API.

- [ ] **Step 8: Seeder**

`EmployeeSeeder::createAccount` — resolve ids:

```php
$departmentId = Department::firstOrCreate(['name' => $department])->id;
$positionId = Position::firstOrCreate(['name' => $position])->id;
// Employee::updateOrCreate(..., ['department_id' => $departmentId, 'position_id' => $positionId, ...])
```

- [ ] **Step 9: Run full related suite**

Run:

```bash
php artisan test --filter=AdminCrudTest
php artisan test --filter=AttendanceAdminApiTest
php artisan test --filter=ScheduleAdminApiTest
php artisan test --filter=FraudFlagReviewTest
php artisan test --filter=EmployeeNameSyncTest
php artisan test --filter=DepartmentPositionCrudTest
```

Expected: PASS

If other tests fail on unknown column `department`, fix them the same way. Optionally run full `php artisan test`.

- [ ] **Step 10: Commit**

```bash
git add app database/seeders tests
git commit -m "feat(api): employees use department_id and position_id"
```

---

### Task 4: Web API client types + SearchableSelect

**Files:**
- Modify: `web/src/api/types.ts`
- Modify: `web/src/api/endpoints.ts`
- Create: `web/src/components/SearchableSelect.tsx`

**Interfaces:**
- Produces:  
  - Types `Department`, `Position` with `{ id: number; name: string; employees_count?: number }`  
  - `Employee.department_id`, `position_id`; `department`/`position` remain string | null names  
  - `EmployeePayload.department_id` / `position_id` (number)  
  - `listDepartments`, `createDepartment`, `updateDepartment`, `deleteDepartment` (+ positions)  
  - `SearchableSelect` props:

```ts
export type SearchableSelectOption = { value: string; label: string };

export type SearchableSelectProps = {
  options: SearchableSelectOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  emptyLabel?: string;
  allowEmpty?: boolean;
  searchPlaceholder?: string;
  noneMatchLabel?: string;
};
```

- [ ] **Step 1: Add types and endpoints**

Mirror branch endpoints pattern in `endpoints.ts`.

```ts
export function listDepartments(params: PaginationParams, token: string): Promise<Paginated<Department>> {
  return api.get<RawPaginated<Department>>('/api/admin/departments', params, token).then(toPaginated);
}
// createDepartment, updateDepartment, deleteDepartment — same shapes as branches but payload { name: string }
```

Same for positions.

- [ ] **Step 2: Implement SearchableSelect**

Copy structure from `web/src/components/EmployeePicker.tsx` single-select mode:

- Radix `Popover`
- Trigger button shows selected option label or placeholder
- Search input filters `options` by `label.toLowerCase().includes(query)`
- Click option → `onChange(value)` and close
- Optional clear when `allowEmpty`
- `noneMatchLabel` default `'No matches.'`
- No free-text commit: typing only filters; value changes only on option click / clear

- [ ] **Step 3: Typecheck**

Run: `cd web; npm run typecheck` (or project’s equivalent — if none, `npx tsc -p tsconfig.json --noEmit`)  
Expected: PASS (or only pre-existing errors unrelated to these files)

- [ ] **Step 4: Commit**

```bash
git add web/src/api/types.ts web/src/api/endpoints.ts web/src/components/SearchableSelect.tsx
git commit -m "feat(web): SearchableSelect and department/position API client"
```

---

### Task 5: Org structure page + navigation

**Files:**
- Create: `web/src/pages/OrgStructurePage.tsx`
- Modify: `web/src/App.tsx`
- Modify: `web/src/components/Layout.tsx`

**Interfaces:**
- Consumes: department/position list/create/update/delete endpoints  
- Produces: route `/org-structure` for roles Super Admin, HR, Branch Manager, Department Head

- [ ] **Step 1: Build OrgStructurePage**

Layout:

- `PageHeader` title “Org structure”, description “Manage departments and positions used on employee records.”
- Grid `grid gap-6 lg:grid-cols-2` with two cards/sections.

Each section (extract inner component `MasterListSection` in same file to avoid duplication):

Props: `title`, `token`, `listFn`, `createFn`, `updateFn`, `deleteFn`, entity label.

State: items, loading, error, page, modal open, editing row, form name, fieldErrors, saving, deleting row, deleteBusy.

Behaviors mirror `BranchesPage.tsx` (load on mount/page, openCreate/openEdit, submit, confirm delete).

Table columns: Name, Employees (if `employees_count` present), Actions (edit/delete icons).

Delete confirm message: `Delete **{name}**? Items assigned to employees cannot be deleted.`

On 422 from delete, `notify` error with `err.message`.

- [ ] **Step 2: Wire route and nav**

`App.tsx`:

```tsx
<Route
  path="/org-structure"
  element={
    <RequireAuth>
      <Layout>
        <RequireRole roles={['Super Admin', 'HR', 'Branch Manager', 'Department Head']}>
          <OrgStructurePage />
        </RequireRole>
      </Layout>
    </RequireAuth>
  }
/>
```

`Layout.tsx` NAV_ITEMS (near Branches):

```ts
{ to: '/org-structure', label: 'Org structure', icon: <Network size={18} />, roles: ALL_ROLES },
```

Import `Network` (or `Layers`) from `lucide-react`. Place after Employees or before Branches.

- [ ] **Step 3: Typecheck / manual smoke**

Run web typecheck. Manually: login as HR → open Org structure → create department “IT” → create position “Engineer” → edit rename → delete unused OK → assign later blocked (after Task 6).

- [ ] **Step 4: Commit**

```bash
git add web/src/pages/OrgStructurePage.tsx web/src/App.tsx web/src/components/Layout.tsx
git commit -m "feat(web): org structure page for departments and positions"
```

---

### Task 6: Employee modal + list filter SearchableSelect

**Files:**
- Modify: `web/src/pages/EmployeesPage.tsx`
- Optionally: `web/src/pages/AttendancePage.tsx` department filter → `department_id` if still free-text (spec: employee list filter required; attendance filter nice-to-have — **do employee page only** unless trivial)

**Interfaces:**
- Consumes: `listDepartments` / `listPositions` with `{ per_page: 100 }`, `SearchableSelect`  
- Form fields: `department_id: string`, `position_id: string`  
- Submit payload numbers via `Number(form.department_id)`

- [ ] **Step 1: Form state**

Replace in `FormState` / `emptyForm` / `openEdit`:

```ts
department_id: string;
position_id: string;
// openEdit:
department_id: employee.department_id != null ? String(employee.department_id) : '',
position_id: employee.position_id != null ? String(employee.position_id) : '',
```

Load options once with token:

```ts
const [departments, setDepartments] = useState<Department[]>([]);
const [positions, setPositions] = useState<Position[]>([]);

useEffect(() => {
  if (!token) return;
  void listDepartments({ per_page: 100 }, token).then((r) => setDepartments(r.data)).catch(() => setDepartments([]));
  void listPositions({ per_page: 100 }, token).then((r) => setPositions(r.data)).catch(() => setPositions([]));
}, [token]);
```

- [ ] **Step 2: Modal fields**

```tsx
<Field label="Department" required error={fieldErrors.department_id?.[0]}>
  <SearchableSelect
    options={departments.map((d) => ({ value: String(d.id), label: d.name }))}
    value={form.department_id}
    onChange={(department_id) => setForm({ ...form, department_id })}
    placeholder="Select department"
    searchPlaceholder="Search departments…"
    allowEmpty={false}
    noneMatchLabel={departments.length === 0 ? 'No departments yet — add them under Org structure.' : 'No matches.'}
  />
</Field>
// same for Position
```

Submit body:

```ts
department_id: Number(form.department_id),
position_id: Number(form.position_id),
```

Client-side: if missing ids, set fieldErrors before API call.

- [ ] **Step 3: List filter**

Filters state: `department_id: string` instead of `department: string`.

```tsx
<SearchableSelect
  options={departments.map(...)}
  value={filters.department_id}
  onChange={(department_id) => setFilters({ ...filters, department_id })}
  placeholder="All departments"
  allowEmpty
  emptyLabel="All departments"
/>
```

`load` params: `if (applied.department_id) params.department_id = applied.department_id`.

Table still displays `r.department` / `r.position` name strings from API.

- [ ] **Step 4: Typecheck**

Run web typecheck. Fix any `Employee` type mismatches.

- [ ] **Step 5: Commit**

```bash
git add web/src/pages/EmployeesPage.tsx
git commit -m "feat(web): searchable department and position on employee form"
```

---

### Task 7: Verification sweep

**Files:** none new — run suites and fix stragglers

- [ ] **Step 1: Backend full test**

Run: `php artisan test`  
Expected: all PASS. Fix any remaining `department` column references.

- [ ] **Step 2: Web typecheck + lint if available**

```bash
cd web
npm run typecheck
npm run lint
```

(Use scripts that exist in `web/package.json` only.)

- [ ] **Step 3: Manual checklist**

1. Seed or create departments/positions on Org structure.  
2. Create employee with dropdowns only.  
3. Edit employee — preselected values, change both.  
4. Filter employees by department_id.  
5. Delete in-use department → error toast.  
6. Delete unused → success.  
7. Login as Department Head — attendance/schedules scoped by department_id.  
8. Portal “More” profile still shows department/position names.

- [ ] **Step 4: Final commit if fixes needed**

```bash
git add -u
git commit -m "fix: finish department/position master data integration"
```

---

## Spec coverage checklist

| Spec requirement | Task |
|------------------|------|
| `departments` / `positions` tables | 1 |
| Employee FK + drop strings + backfill | 1 |
| Master CRUD API + unique name | 2 |
| Delete blocked in use | 2 |
| Routes for all admin roles | 2 |
| Employee write ids + read names + ids | 3 |
| Filters + Department Head scope by id | 3 |
| Seeders/factories/tests | 1, 3 |
| SearchableSelect | 4 |
| Org structure page + nav | 5 |
| Employee create/edit dropdowns | 6 |
| Employee list department filter dropdown | 6 |
| Resources keep display names | 3 |

## Execution handoff

Plan saved to `docs/superpowers/plans/2026-09-16-department-position-master-data.md`.

**Two execution options:**

1. **Subagent-Driven (recommended)** — fresh subagent per task, review between tasks  
2. **Inline Execution** — this session with executing-plans, batched checkpoints  

Which approach?
