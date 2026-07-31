<?php

namespace Database\Seeders;

use App\Models\Branch;
use App\Models\Employee;
use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;

class EmployeeSeeder extends Seeder
{
    public function run(): void
    {
        $branches = Branch::all();
        $makati = $branches->firstWhere('code', 'MAK-001');
        $qc = $branches->firstWhere('code', 'QCN-002');

        $password = Hash::make('password');

        $this->createAccount('ADMIN001', 'System', 'Administrator', 'admin@dtr.test', $makati, 'Administration', 'Super Admin', 'Super Admin', $password);
        $this->createAccount('HR001', 'Maria', 'Santos', 'hr@dtr.test', $makati, 'Human Resources', 'HR Manager', 'HR', $password);
        $this->createAccount('PAY001', 'Jose', 'Reyes', 'payroll@dtr.test', $makati, 'Finance', 'Payroll Officer', 'Payroll Officer', $password);
        $this->createAccount('MGR001', 'Ana', 'Cruz', 'manager.makati@dtr.test', $makati, 'Operations', 'Branch Manager', 'Branch Manager', $password);
        $this->createAccount('MGR002', 'Pedro', 'Diaz', 'manager.qc@dtr.test', $qc, 'Operations', 'Branch Manager', 'Branch Manager', $password);
        $this->createAccount('DH001', 'Liza', 'Garcia', 'depthead@dtr.test', $makati, 'IT', 'Department Head', 'Department Head', $password);

        $employees = [
            ['EMP001', 'Juan', 'Dela Cruz', 'juan.delacruz@dtr.test', $makati, 'IT', 'Software Engineer'],
            ['EMP002', 'Karla', 'Mendoza', 'karla.mendoza@dtr.test', $makati, 'IT', 'QA Tester'],
            ['EMP003', 'Miguel', 'Torres', 'miguel.torres@dtr.test', $makati, 'Sales', 'Sales Associate'],
            ['EMP004', 'Sofia', 'Ramos', 'sofia.ramos@dtr.test', $makati, 'Sales', 'Sales Associate'],
            ['EMP005', 'Carlos', 'Aquino', 'carlos.aquino@dtr.test', $makati, 'Operations', 'Admin Staff'],
            ['EMP006', 'Bea', 'Villanueva', 'bea.villanueva@dtr.test', $qc, 'IT', 'Support Engineer'],
            ['EMP007', 'Rafael', 'Navarro', 'rafael.navarro@dtr.test', $qc, 'Operations', 'Admin Staff'],
            ['EMP008', 'Nicole', 'Pascual', 'nicole.pascual@dtr.test', $qc, 'Sales', 'Sales Associate'],
            ['EMP009', 'Marco', 'Salazar', 'marco.salazar@dtr.test', $qc, 'Operations', 'Admin Staff'],
            ['EMP010', 'Trisha', 'Lopez', 'trisha.lopez@dtr.test', $qc, 'Sales', 'Sales Associate'],
        ];

        foreach ($employees as [$employeeId, $first, $last, $email, $branch, $dept, $position]) {
            $this->createAccount($employeeId, $first, $last, $email, $branch, $dept, $position, 'Employee', $password);
        }
    }

    private function createAccount(
        string $employeeId,
        string $firstName,
        string $lastName,
        string $email,
        Branch $branch,
        string $department,
        string $position,
        string $role,
        string $password,
    ): void {
        $user = User::updateOrCreate(
            ['employee_id' => $employeeId],
            [
                'name' => "{$firstName} {$lastName}",
                'email' => $email,
                'password' => $password,
                'is_active' => true,
            ],
        );

        $user->syncRoles([$role]);

        Employee::updateOrCreate(
            ['user_id' => $user->id],
            [
                'branch_id' => $branch->id,
                'first_name' => $firstName,
                'last_name' => $lastName,
                'department' => $department,
                'position' => $position,
                'date_hired' => now()->subYears(rand(1, 5))->subMonths(rand(0, 11)),
            ],
        );
    }
}
