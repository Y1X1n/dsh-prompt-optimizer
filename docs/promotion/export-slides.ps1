$ErrorActionPreference = "Stop"
$src = "E:\dsh-plugins\dsh-prompt-optimizer\docs\promotion\dsh-prompt-optimizer-推广.pptx"
$out = "E:\dsh-plugins\dsh-prompt-optimizer\docs\promotion\render"
New-Item -ItemType Directory -Force -Path $out | Out-Null
$pp = New-Object -ComObject PowerPoint.Application
$pres = $pp.Presentations.Open($src, -1, 0, 0)
$n = $pres.Slides.Count
for ($i = 1; $i -le $n; $i++) {
  $f = Join-Path $out ("slide-{0:d2}.png" -f $i)
  $pres.Slides.Item($i).Export($f, "PNG", 1500, 844)
}
$pres.Close()
Write-Output ("EXPORTED " + $n + " slides")
