<#
.SYNOPSIS
End-to-end acceptance smoke test for the DTR backend API.

.DESCRIPTION
Runs the full user journey against a live server: auth, MFA, attendance
punches (GPS + selfie), sync, schedule, notifications, consent, data
requests, admin scoped views, reports, payroll exports, fraud review
access, and the retention dry-run. Prints [PASS]/[WARN]/[FAIL] per step
and exits with 1 if any step failed.

.PARAMETER BaseUrl
Base URL of the running server (default: http://127.0.0.1:8000).

.EXAMPLE
powershell -ExecutionPolicy Bypass -File scripts\acceptance.ps1
#>
param(
    [string]$BaseUrl = 'http://127.0.0.1:8000'
)

$ErrorActionPreference = 'Stop'
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$Failures = 0

function Report([string]$Status, [string]$Name, [string]$Detail = '') {
    $mark = switch ($Status) { 'PASS' { 'PASS' }; 'WARN' { 'WARN' }; default { 'FAIL' } }
    Write-Host ("[{0}] {1} {2}" -f $mark, $Name, $Detail)
    if ($Status -eq 'FAIL') { $script:Failures++ }
}

function JsonPost([string]$Uri, $Body, [hashtable]$Headers = @{}) {
    Invoke-RestMethod -Uri $Uri -Method Post -Headers $Headers -ContentType 'application/json' -Body ($Body | ConvertTo-Json -Depth 6)
}

function Tinker([string]$Code) {
    $out = & php artisan tinker --execute=$Code 2>&1
    return ($out -join "`n").Trim()
}

function TotpFor([string]$EmployeeId) {
    $secret = Tinker "echo App\Models\User::where('employee_id','$EmployeeId')->first()?->two_factor_secret;"
    if ([string]::IsNullOrWhiteSpace($secret)) { throw "No TOTP secret for $EmployeeId" }
    return (Tinker "echo (new PragmaRX\Google2FA\Google2FA)->getCurrentOtp('$secret');").Trim()
}

function ServerDate([int]$OffsetDays = 0) {
    return Tinker "echo now()->subDays($OffsetDays)->toDateString();"
}

function New-SelfieFile([string]$Path) {
    Add-Type -AssemblyName System.Drawing
    $bmp = New-Object System.Drawing.Bitmap(800, 600)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.Clear([System.Drawing.Color]::CornflowerBlue)
    $g.DrawString('ACCEPTANCE', (New-Object System.Drawing.Font('Arial', 48)), [System.Drawing.Brushes]::White, 60, 60)
    $bmp.Save($Path, [System.Drawing.Imaging.ImageFormat]::Png)
    $g.Dispose(); $bmp.Dispose()
}

function Send-Multipart([string]$Uri, [hashtable]$Headers, [string]$FilePath, [string]$FieldName, [string]$FileName, [hashtable]$Fields = @{}) {
    Add-Type -AssemblyName System.Net.Http
    $client = New-Object System.Net.Http.HttpClient
    if ($Headers.ContainsKey('Authorization')) {
        $client.DefaultRequestHeaders.Authorization = New-Object System.Net.Http.Headers.AuthenticationHeaderValue('Bearer', $Headers['Authorization'].Replace('Bearer ', ''))
    }
    $content = New-Object System.Net.Http.MultipartFormDataContent
    foreach ($key in $Fields.Keys) {
        $content.Add((New-Object System.Net.Http.StringContent([string]$Fields[$key])), $key)
    }
    $stream = [System.IO.File]::OpenRead($FilePath)
    try {
        $fileContent = New-Object System.Net.Http.StreamContent($stream)
        $fileContent.Headers.ContentType = New-Object System.Net.Http.Headers.MediaTypeHeaderValue('image/png')
        $content.Add($fileContent, $FieldName, $FileName)
        $resp = $client.PostAsync($Uri, $content).Result
        return @{ Status = [int]$resp.StatusCode; Body = $resp.Content.ReadAsStringAsync().Result }
    } finally {
        $stream.Dispose(); $client.Dispose()
    }
}

Write-Host "== DTR Acceptance Smoke (target: $BaseUrl) =="

Push-Location $ProjectRoot
try {
    # --- 1. Unauthenticated request must be a JSON 401 (not 500) ---
    try {
        Invoke-RestMethod -Uri "$BaseUrl/api/attendance/history" -ErrorAction Stop | Out-Null
        Report 'FAIL' 'unauthenticated -> 401'
    } catch {
        if ([int]$_.Exception.Response.StatusCode -eq 401) { Report 'PASS' 'unauthenticated -> 401' }
        else { Report 'FAIL' 'unauthenticated -> 401' ("got $([int]$_.Exception.Response.StatusCode)") }
    }

    # --- 2. Employee login (EMP001) ---
    $selfie = Join-Path $env:TEMP 'dtr_acceptance_selfie.png'
    New-SelfieFile $selfie
    $makati = @{ latitude = 14.554729; longitude = 121.0244452; accuracy_meters = 25 }

    $login = JsonPost "$BaseUrl/api/auth/login" @{ employee_id = 'EMP001'; password = 'password'; device_id = 'demo-device-1' }
    $empToken = $login.token
    if (-not $empToken) { Report 'FAIL' 'EMP001 login'; exit 1 } else { Report 'PASS' 'EMP001 login' }

    # --- 3. Schedule for today ---
    $sched = Invoke-RestMethod -Uri "$BaseUrl/api/schedule/today" -Headers @{ Authorization = "Bearer $empToken" }
    Report 'PASS' 'schedule today' ("shift=$($sched.data.shift.name)")

    # --- 4. Time in (GPS + selfie) ---
    $punch = Send-Multipart "$BaseUrl/api/attendance/time-in" @{ Authorization = "Bearer $empToken" } $selfie 'selfie' 'selfie.png' @{
        latitude = 14.554729
        longitude = 121.0244452
        accuracy_meters = 25
        device_id = 'demo-device-1'
    }
    if ($punch.Status -eq 201) { Report 'PASS' 'time-in (GPS + selfie)' }
    elseif ($punch.Status -eq 409) { Report 'WARN' 'time-in already clocked in (409)' }
    else { Report 'FAIL' 'time-in' "status=$($punch.Status) body=$($punch.Body.Substring(0, [Math]::Min(200, $punch.Body.Length)))" }

    # --- 5. Time out ---
    $punch = Send-Multipart "$BaseUrl/api/attendance/time-out" @{ Authorization = "Bearer $empToken" } $selfie 'selfie' 'selfie.png' @{
        latitude = 14.554729
        longitude = 121.0244452
        accuracy_meters = 25
        device_id = 'demo-device-1'
    }
    if ($punch.Status -in @(200, 201)) { Report 'PASS' 'time-out' }
    elseif ($punch.Status -eq 409) { Report 'WARN' 'time-out no open punch (409)' }
    else { Report 'FAIL' 'time-out' "status=$($punch.Status) body=$($punch.Body.Substring(0, [Math]::Min(200, $punch.Body.Length)))" }

    # --- 6. History + offline sync ---
    $history = Invoke-RestMethod -Uri "$BaseUrl/api/attendance/history?per_page=5" -Headers @{ Authorization = "Bearer $empToken" }
    Report 'PASS' 'attendance history' ("records=$($history.meta.total)")

    $sync = JsonPost "$BaseUrl/api/attendance/sync" @{
        device_id = 'demo-device-1'
        records   = @(@{
            client_uuid   = [guid]::NewGuid().ToString()
            type          = 'time_in'
            timestamp     = (Get-Date).ToString('yyyy-MM-dd HH:mm:ss')
            latitude      = 14.554729
            longitude     = 121.0244452
            accuracy_meters = 25
        })
    } @{ Authorization = "Bearer $empToken" }
    if ($sync.failed -eq 0 -and $sync.synced -ge 1) { Report 'PASS' 'offline sync' "synced=$($sync.synced) dupes=$($sync.duplicates)" }
    elseif ($sync.synced -eq 0 -and $sync.failed -ge 1) { Report 'WARN' 'offline sync record rejected' "failed=$($sync.failed) (already clocked in)" }
    else { Report 'FAIL' 'offline sync' "synced=$($sync.synced) failed=$($sync.failed)" }

    # --- 7. Consent ---
    $consent = JsonPost "$BaseUrl/api/employee/consent" @{ type = 'gps_location'; granted = $true } @{ Authorization = "Bearer $empToken" }
    if ($consent.data.granted -eq $true) { Report 'PASS' 'consent grant' } else { Report 'FAIL' 'consent grant' }

    # --- 8. Notifications ---
    $unread = Invoke-RestMethod -Uri "$BaseUrl/api/notifications/unread-count" -Headers @{ Authorization = "Bearer $empToken" }
    Report 'PASS' 'notifications unread-count' "count=$($unread.count)"

    # --- 9. HR login + MFA ---
    $hrLogin = JsonPost "$BaseUrl/api/auth/login" @{ employee_id = 'HR001'; password = 'password'; device_id = 'device-hr001' }
    if ($hrLogin.token) {
        Report 'PASS' 'HR001 login (no MFA required)'
        $hrToken = $hrLogin.token
    } else {
        $code = TotpFor 'HR001'
        $verify = JsonPost "$BaseUrl/api/auth/mfa/verify" @{ code = $code; mfa_token = $hrLogin.mfa_token }
        if (-not $verify.token) { Report 'FAIL' 'HR001 MFA verify'; exit 1 }
        Report 'PASS' 'HR001 login + MFA verify'
        $hrToken = $verify.token
    }
    $hr = @{ Authorization = "Bearer $hrToken" }

    # --- 10. HR admin views ---
    $dash = Invoke-RestMethod -Uri "$BaseUrl/api/admin/dashboard/summary" -Headers $hr
    if ($null -ne $dash.time_ins_today) { Report 'PASS' 'dashboard summary' "time_ins=$($dash.time_ins_today) late=$($dash.late_ins_today) absent=$($dash.absent_today)" }
    else { Report 'FAIL' 'dashboard summary' }

    $att = Invoke-RestMethod -Uri "$BaseUrl/api/admin/attendance?per_page=5" -Headers $hr
    Report 'PASS' 'admin attendance list' "records=$($att.meta.total)"

    $employees = Invoke-RestMethod -Uri "$BaseUrl/api/admin/employees?per_page=5" -Headers $hr
    if ($employees.data.Count -gt 0) { Report 'PASS' 'admin employees list' } else { Report 'FAIL' 'admin employees list' }

    Invoke-RestMethod -Uri "$BaseUrl/api/admin/fraud-flags" -Headers $hr | Out-Null
    Report 'PASS' 'fraud flags list'

    Invoke-RestMethod -Uri "$BaseUrl/api/admin/audit-logs?per_page=5" -Headers $hr | Out-Null
    Report 'PASS' 'audit logs list'

    # --- 11. Reference photo upload (compression path) ---
    $ref = Send-Multipart "$BaseUrl/api/admin/employees/3/reference-photo" $hr $selfie 'photo' 'ref.png'
    if ($ref.Status -eq 200 -and $ref.Body -match '"reference_photo_path":"([^"]+)"') {
        if ($Matches[1] -match '\.jpg$') { Report 'PASS' 'reference photo upload (compressed jpg)' }
        else { Report 'FAIL' 'reference photo upload' "not jpg: $($Matches[1])" }
    } else { Report 'FAIL' 'reference photo upload' "status=$($ref.Status)" }

    # --- 12. Reports (async daily export) ---
    $from = ServerDate 7
    $to = ServerDate 0
    $report = JsonPost "$BaseUrl/api/admin/reports" @{ type = 'daily'; date_from = $from; date_to = $to } $hr
    $reportId = $report.data.id
    if (-not $reportId) { Report 'FAIL' 'report request'; exit 1 }
    Tinker "Artisan::call('queue:work', ['--stop-when-empty' => true]);" | Out-Null
    $dl = Invoke-WebRequest -Uri "$BaseUrl/api/admin/reports/$reportId/download" -Headers $hr -UseBasicParsing
    if ($dl.StatusCode -eq 200 -and $dl.Content -match 'employee_id') { Report 'PASS' 'report request + download' }
    else { Report 'FAIL' 'report request + download' }

    # --- 13. Payroll export ---
    $payroll = JsonPost "$BaseUrl/api/admin/payroll-exports" @{ date_from = $from; date_to = $to } $hr
    if ($payroll.data.id) { Report 'PASS' 'payroll export request' } else { Report 'FAIL' 'payroll export request' }
    Tinker "Artisan::call('queue:work', ['--stop-when-empty' => true]);" | Out-Null
    $payDl = Invoke-WebRequest -Uri "$BaseUrl/api/admin/payroll-exports/$($payroll.data.id)/download" -Headers $hr -UseBasicParsing
    if ($payDl.StatusCode -eq 200 -and $payDl.Content -match 'employee_id') { Report 'PASS' 'payroll export download' }
    else { Report 'FAIL' 'payroll export download' }

    # --- 14. Branch Manager scoping (MGR001 + MFA) ---
    $mgLogin = JsonPost "$BaseUrl/api/auth/login" @{ employee_id = 'MGR001'; password = 'password'; device_id = 'device-mgr001' }
    if ($mgLogin.token) {
        Report 'PASS' 'MGR001 login (no MFA required)'
        $mgToken = $mgLogin.token
    } else {
        $code = TotpFor 'MGR001'
        $verify = JsonPost "$BaseUrl/api/auth/mfa/verify" @{ code = $code; mfa_token = $mgLogin.mfa_token }
        if (-not $verify.token) { Report 'FAIL' 'MGR001 MFA verify'; exit 1 }
        Report 'PASS' 'MGR001 login + MFA verify'
        $mgToken = $verify.token
    }
    $mgAtt = Invoke-RestMethod -Uri "$BaseUrl/api/admin/attendance?per_page=100" -Headers @{ Authorization = "Bearer $mgToken" }
    $badBranches = @($mgAtt.data | Where-Object { $_.branch.id -ne 1 })
    if ($badBranches.Count -eq 0) { Report 'PASS' 'BM attendance scope (Makati only)' }
    else { Report 'FAIL' 'BM attendance scope' "$($badBranches.Count) records outside own branch" }

    # --- 15. Employee cannot access admin routes ---
    try {
        Invoke-RestMethod -Uri "$BaseUrl/api/admin/dashboard/summary" -Headers @{ Authorization = "Bearer $empToken" } -ErrorAction Stop | Out-Null
        Report 'FAIL' 'employee blocked from admin'
    } catch {
        if ([int]$_.Exception.Response.StatusCode -eq 403) { Report 'PASS' 'employee blocked from admin (403)' }
        else { Report 'FAIL' 'employee blocked from admin' }
    }

    # --- 16. Logout ---
    JsonPost "$BaseUrl/api/auth/logout" @{} @{ Authorization = "Bearer $empToken" } | Out-Null
    Report 'PASS' 'logout'

    # --- 17. Retention purge dry-run ---
    $dry = Tinker "Artisan::call('dtr:purge-old-data', ['--dry-run' => true]); echo Artisan::output();"
    if ($dry -match 'Would delete') { Report 'PASS' 'retention purge dry-run' $dry.Trim() }
    else { Report 'FAIL' 'retention purge dry-run' }
} finally {
    Pop-Location
}

Write-Host ""
if ($Failures -gt 0) {
    Write-Host "RESULT: $Failures step(s) FAILED" -ForegroundColor Red
    exit 1
} else {
    Write-Host 'RESULT: all steps passed' -ForegroundColor Green
    exit 0
}
