# Conninter E2E smoke test against production API. Creates temp users, verifies flows, deletes them.
$ErrorActionPreference = "Stop"
$API = "https://connitor.menteetracker.com"
$pass = 0
$fail = 0
$createdUserIds = [System.Collections.Generic.List[string]]::new()
$results = @()

function Assert-True($cond, $name, $detail = "") {
  if ($cond) {
    $script:pass++
    $script:results += "PASS  $name"
    Write-Host "PASS  $name" -ForegroundColor Green
  } else {
    $script:fail++
    $msg = if ($detail) { "$name - $detail" } else { $name }
    $script:results += "FAIL  $msg"
    Write-Host "FAIL  $msg" -ForegroundColor Red
  }
}

function Invoke-Api {
  param(
    [string]$Method,
    [string]$Path,
    [object]$Body = $null,
    [string]$Token = $null,
    [switch]$RawStatus
  )
  $headers = @{ "Content-Type" = "application/json" }
  if ($Token) { $headers["Authorization"] = "Bearer $Token" }
  $uri = "$API$Path"
  $json = if ($null -ne $Body) { $Body | ConvertTo-Json -Depth 8 -Compress } else { $null }
  try {
    if ($null -ne $json) {
      $resp = Invoke-WebRequest -Uri $uri -Method $Method -Headers $headers -Body $json -UseBasicParsing
    } else {
      $resp = Invoke-WebRequest -Uri $uri -Method $Method -Headers $headers -UseBasicParsing
    }
    if ($RawStatus) { return @{ Status = [int]$resp.StatusCode; Body = $resp.Content } }
    if ([string]::IsNullOrWhiteSpace($resp.Content)) { return $null }
    return ($resp.Content | ConvertFrom-Json)
  } catch {
    $status = 0
    $content = ""
    if ($_.Exception.Response) {
      $status = [int]$_.Exception.Response.StatusCode
      try {
        $stream = $_.Exception.Response.GetResponseStream()
        $reader = New-Object System.IO.StreamReader($stream)
        $content = $reader.ReadToEnd()
      } catch {}
    }
    if ($RawStatus) { return @{ Status = $status; Body = $content } }
    throw "HTTP $status $Method $Path : $content"
  }
}

$stamp = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
$emailA = "e2e.exhibitor.a.$stamp@conninter.example"
$emailB = "e2e.exhibitor.b.$stamp@conninter.example"
$pinLogin = "4321"

Write-Host ""
Write-Host "=== 1. Health ===" -ForegroundColor Cyan
$h = Invoke-Api GET /health
Assert-True ($h.status -eq "ok") "GET /health"

Write-Host ""
Write-Host "=== 2. Admin login ===" -ForegroundColor Cyan
$admin = Invoke-Api POST /api/auth/login @{ email = "admin@conninter.example"; pin = "2026" }
Assert-True ($admin.token -and $admin.user.role -eq "Admin") "Admin login"
$adminTok = $admin.token

Write-Host ""
Write-Host "=== 3. Invite + activate exhibitor A ===" -ForegroundColor Cyan
$invite = Invoke-Api POST /api/admin/invite @{ fresh = $true } -Token $adminTok
Assert-True ($invite.token -and $invite.pin) "Create fresh invite"
$lookup = Invoke-Api GET "/api/auth/invite/$($invite.token)"
Assert-True ($lookup.ok -eq $true) "Lookup invite token"

$badAct = Invoke-Api POST /api/auth/activate @{
  token = $invite.token; pin = "0000"; name = "Bad"; email = "bad.$stamp@conninter.example"; loginPin = "1111"
} -RawStatus
Assert-True ($badAct.Status -eq 401) "Activate rejects wrong PIN" "status=$($badAct.Status)"

$invite = Invoke-Api POST /api/admin/invite/refresh @{} -Token $adminTok
$actA = Invoke-Api POST /api/auth/activate @{
  token = $invite.token
  pin = $invite.pin
  name = "E2E Exhibitor A"
  email = $emailA
  loginPin = $pinLogin
}
Assert-True ($actA.token -and $actA.user.role -eq "Rep") "Activate exhibitor A"
Assert-True ([bool]$actA.user.shareToken) "Exhibitor A has shareToken"
$tokA = $actA.token
$idA = [string]$actA.user.id
$shareA = [string]$actA.user.shareToken
[void]$createdUserIds.Add($idA)

Write-Host ""
Write-Host "=== 4. Activate exhibitor B (isolation) ===" -ForegroundColor Cyan
$invite2 = Invoke-Api POST /api/admin/invite @{ fresh = $true } -Token $adminTok
$actB = Invoke-Api POST /api/auth/activate @{
  token = $invite2.token
  pin = $invite2.pin
  name = "E2E Exhibitor B"
  email = $emailB
  loginPin = $pinLogin
}
Assert-True ($actB.token -and $actB.user.id) "Activate exhibitor B"
$tokB = $actB.token
$idB = [string]$actB.user.id
$shareB = [string]$actB.user.shareToken
[void]$createdUserIds.Add($idB)

Write-Host ""
Write-Host "=== 5. Self profile edit ===" -ForegroundColor Cyan
$me = Invoke-Api PATCH /api/auth/me @{
  name = "E2E Exhibitor A Co"
  company = "Acme Med Devices"
  designation = "Booth Lead"
  mobile = "9876543210"
} -Token $tokA
Assert-True ($me.user.company -eq "Acme Med Devices") "PATCH /api/auth/me company"
Assert-True ($me.user.mobile -eq "9876543210") "PATCH /api/auth/me mobile"
Assert-True ($me.user.shareToken -eq $shareA) "shareToken stable after profile edit"
$tokA = $me.token

$meGet = Invoke-Api GET /api/auth/me -Token $tokA
Assert-True ($meGet.user.company -eq "Acme Med Devices") "GET /api/auth/me"

$dup = Invoke-Api PATCH /api/auth/me @{ email = $emailB } -Token $tokA -RawStatus
Assert-True ($dup.Status -eq 409) "Duplicate email rejected" "status=$($dup.Status)"

Write-Host ""
Write-Host "=== 6. Public exhibitor page ===" -ForegroundColor Cyan
$pub = Invoke-Api GET "/api/public/exhibitors/$shareA"
Assert-True ($pub.name -eq "E2E Exhibitor A Co") "Public exhibitor name"
Assert-True ($pub.company -eq "Acme Med Devices") "Public exhibitor company"
Assert-True (@($pub.interests).Count -gt 0) "Public interests catalog"

$missing = Invoke-Api GET "/api/public/exhibitors/not-a-real-token" -RawStatus
Assert-True ($missing.Status -eq 404) "Unknown share token 404"

Write-Host ""
Write-Host "=== 7. Public visitor lead submit ===" -ForegroundColor Cyan
$badLead = Invoke-Api POST "/api/public/exhibitors/$shareA/leads" @{
  name = "No Contact"
} -RawStatus
Assert-True ($badLead.Status -eq 400) "Lead requires mobile or email"

$leadA1 = Invoke-Api POST "/api/public/exhibitors/$shareA/leads" @{
  name = "Visitor Alice"
  company = "City Hospital"
  designation = "Procurement"
  mobile = "9123456780"
  email = "alice.e2e.$stamp@example.com"
  city = "Mumbai"
  interests = @("Medical Equipment", "Diagnostics")
  captureSource = "qr"
}
Assert-True ($leadA1.ok -eq $true) "Visitor lead to exhibitor A (form)"
Assert-True ($leadA1.lead.capturedBy -eq $idA) "Lead A capturedBy = exhibitor A"

$leadA2 = Invoke-Api POST "/api/public/exhibitors/$shareA/leads" @{
  name = "Visitor Card Bob"
  company = "Care Labs"
  mobile = "9123456781"
  email = "bob.e2e.$stamp@example.com"
  city = "Pune"
  interests = @("AI Solutions")
  captureSource = "card"
  ocrText = "Bob Card OCR sample"
}
Assert-True ($leadA2.ok -eq $true -and $leadA2.lead.captureSource -eq "card") "Visitor lead to A (card source)"

$leadB1 = Invoke-Api POST "/api/public/exhibitors/$shareB/leads" @{
  name = "Visitor Only B"
  mobile = "9123456782"
  email = "onlyb.e2e.$stamp@example.com"
  city = "Delhi"
  interests = @("Software")
  captureSource = "qr"
}
Assert-True ($leadB1.ok -eq $true -and $leadB1.lead.capturedBy -eq $idB) "Visitor lead to exhibitor B"

Write-Host ""
Write-Host "=== 8. Exhibitor login + scoped seed ===" -ForegroundColor Cyan
$loginA = Invoke-Api POST /api/auth/login @{ email = $emailA; pin = $pinLogin }
Assert-True ([bool]$loginA.token) "Exhibitor A login with PIN"
$tokA = $loginA.token

$seedA = Invoke-Api GET /api/seed -Token $tokA
$namesA = @($seedA.leads | ForEach-Object { $_.name })
Assert-True ($namesA -contains "Visitor Alice") "A seed includes Alice"
Assert-True ($namesA -contains "Visitor Card Bob") "A seed includes Bob"
Assert-True (-not ($namesA -contains "Visitor Only B")) "A seed excludes B visitor"
Assert-True ((@($seedA.leads | Where-Object { $_.capturedBy -and $_.capturedBy -ne $idA })).Count -eq 0) "All A seed leads owned by A"

$seedB = Invoke-Api GET /api/seed -Token $tokB
$namesB = @($seedB.leads | ForEach-Object { $_.name })
Assert-True ($namesB -contains "Visitor Only B") "B seed includes own visitor"
Assert-True (-not ($namesB -contains "Visitor Alice")) "B seed excludes Alice"

Write-Host ""
Write-Host "=== 9. Admin clients + filtered leads ===" -ForegroundColor Cyan
$users = Invoke-Api GET /api/admin/users -Token $adminTok
$repA = @($users | Where-Object { $_.id -eq $idA })[0]
Assert-True ($null -ne $repA) "Admin lists exhibitor A"
Assert-True ([int]$repA.leadsCaptured -ge 2) "Admin lead count for A >= 2" "count=$($repA.leadsCaptured)"

$adminLeadsA = @(Invoke-Api GET "/api/admin/leads?capturedBy=$idA" -Token $adminTok)
$aliceMatches = @($adminLeadsA | Where-Object { $_.name -eq "Visitor Alice" })
$bInA = @($adminLeadsA | Where-Object { $_.name -eq "Visitor Only B" })
Assert-True ($aliceMatches.Count -eq 1) "Admin filter leads by A" "alice=$($aliceMatches.Count) total=$($adminLeadsA.Count)"
Assert-True ($bInA.Count -eq 0) "Admin filter excludes B"

$patchAdmin = Invoke-Api PATCH "/api/admin/users/$idA" @{
  designation = "Senior Booth Lead"
} -Token $adminTok
Assert-True ($patchAdmin.designation -eq "Senior Booth Lead") "Admin can edit exhibitor profile fields"

Write-Host ""
Write-Host "=== 9b. Custom interest + audio backup ===" -ForegroundColor Cyan
$customTag = "Custom E2E Widget $stamp"
$leadCustom = Invoke-Api POST /api/leads @{
  id = [guid]::NewGuid().ToString()
  name = "Custom Interest Visitor"
  company = "Widget Co"
  designation = "Buyer"
  mobile = "9000000001"
  email = "custom.interest.$stamp@example.com"
  city = "Chennai"
  priority = "warm"
  interests = @($customTag)
  summary = "Interested in custom widget"
  synced = $false
  capturedAt = (Get-Date).ToUniversalTime().ToString("o")
  captureSource = "manual"
  captureMeta = @{ liveTranscript = "talking about widgets"; voiceStatus = "processing"; processingNote = $true }
} -Token $tokA
Assert-True ($leadCustom.ok -eq $true) "Upsert lead with custom interest"
Assert-True (@($leadCustom.lead.interests) -contains $customTag) "Lead stores custom interest"

$bytes = New-Object byte[] 128
(New-Object Random).NextBytes($bytes)
$audioB64 = [Convert]::ToBase64String($bytes)
$audioUp = Invoke-Api POST /api/capture/audio @{
  audioBase64 = $audioB64
  mimeType = "audio/webm"
  leadId = $leadCustom.lead.id
} -Token $tokA
Assert-True ($audioUp.ok -eq $true -and $audioUp.id) "Upload audio backup"
$audioId = [string]$audioUp.id

$leadWithAudio = Invoke-Api POST /api/leads @{
  id = $leadCustom.lead.id
  name = $leadCustom.lead.name
  company = $leadCustom.lead.company
  designation = $leadCustom.lead.designation
  mobile = $leadCustom.lead.mobile
  email = $leadCustom.lead.email
  city = $leadCustom.lead.city
  priority = "warm"
  interests = @($customTag)
  summary = "Interested in custom widget"
  synced = $false
  capturedAt = $leadCustom.lead.capturedAt
  captureSource = "manual"
  captureMeta = @{
    audioId = $audioId
    liveTranscript = "talking about widgets"
    transcript = "talking about widgets"
    voiceStatus = "ready"
  }
} -Token $tokA
Assert-True ($leadWithAudio.ok -eq $true) "Upsert lead binds audioId"
Assert-True ($leadWithAudio.lead.captureMeta.audioId -eq $audioId) "Lead captureMeta has audioId"

$reprocess = Invoke-Api POST "/api/capture/audio/$audioId/transcribe?transcript_hint=talking%20about%20widgets" @{} -Token $tokA
Assert-True ($null -ne $reprocess.ok) "Reprocess stored audio returns response"

$tinyPng = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
$cardUp = Invoke-Api POST /api/capture/card-image @{
  imageBase64 = $tinyPng
  mimeType = "image/png"
} -Token $tokA -RawStatus
# tiny png may be rejected as too small — accept 200 or 400
Assert-True ($cardUp.Status -eq 200 -or $cardUp.Status -eq 400) "Card image endpoint responds" "status=$($cardUp.Status)"

Write-Host ""
Write-Host "=== 10. Cleanup - delete test exhibitors ===" -ForegroundColor Cyan
foreach ($uid in $createdUserIds) {
  $del = Invoke-Api DELETE "/api/admin/users/$uid" -Token $adminTok -RawStatus
  Assert-True ($del.Status -eq 200) "Delete user $uid" "status=$($del.Status)"
}

$usersAfter = @(Invoke-Api GET /api/admin/users -Token $adminTok)
$stillThere = @($usersAfter | Where-Object { $createdUserIds -contains $_.id })
Assert-True ($stillThere.Count -eq 0) "Test users removed from admin list"

$goneA = Invoke-Api GET "/api/public/exhibitors/$shareA" -RawStatus
$goneB = Invoke-Api GET "/api/public/exhibitors/$shareB" -RawStatus
Assert-True ($goneA.Status -eq 404) "Public page A gone after delete"
Assert-True ($goneB.Status -eq 404) "Public page B gone after delete"

$adminAll = @(Invoke-Api GET "/api/admin/leads?q=Visitor%20Alice" -Token $adminTok)
$aliceLeft = @($adminAll | Where-Object { $_.email -like "*$stamp*" })
Assert-True ($aliceLeft.Count -eq 0) "Visitor leads removed with exhibitor A"

# Sweep any leftover e2e.*@conninter.example users
$sweep = @($usersAfter | Where-Object { $_.email -like "e2e.exhibitor*@conninter.example" })
foreach ($u in $sweep) {
  try { Invoke-Api DELETE "/api/admin/users/$($u.id)" -Token $adminTok | Out-Null } catch {}
}

Write-Host ""
Write-Host "=== SUMMARY ===" -ForegroundColor Cyan
Write-Host "PASS=$pass FAIL=$fail"
if ($fail -gt 0) { exit 1 } else { exit 0 }
