$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$taskBitmap = New-Object System.Drawing.Bitmap(256, 256)
$taskGraphics = [System.Drawing.Graphics]::FromImage($taskBitmap)
$taskGraphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$taskGraphics.Clear([System.Drawing.Color]::FromArgb(49, 91, 73))
$taskPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(246, 248, 239), 13)
$taskPen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
$taskPen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
$taskPen.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round
$taskLeft = New-Object System.Drawing.Drawing2D.GraphicsPath
$taskLeft.AddBezier(128,192,105,176,78,174,52,181)
$taskLeft.AddLine(52,181,52,79)
$taskLeft.AddBezier(52,79,78,70,105,72,128,89)
$taskLeft.CloseFigure()
$taskRight = New-Object System.Drawing.Drawing2D.GraphicsPath
$taskRight.AddBezier(128,192,151,176,178,174,204,181)
$taskRight.AddLine(204,181,204,79)
$taskRight.AddBezier(204,79,178,70,151,72,128,89)
$taskRight.CloseFigure()
$taskGraphics.DrawPath($taskPen,$taskLeft)
$taskGraphics.DrawPath($taskPen,$taskRight)
$taskGraphics.DrawLine($taskPen,76,108,104,110)
$taskGraphics.DrawLine($taskPen,76,132,104,134)
$taskGraphics.DrawLine($taskPen,152,110,180,108)
$taskGraphics.DrawLine($taskPen,152,134,180,132)
$taskMemory = New-Object System.IO.MemoryStream
$taskBitmap.Save($taskMemory,[System.Drawing.Imaging.ImageFormat]::Png)
$taskPng = $taskMemory.ToArray()
$taskFile = [System.IO.File]::Create((Join-Path (Get-Location) 'assets\icon.ico'))
$taskWriter = New-Object System.IO.BinaryWriter($taskFile)
$taskWriter.Write([uint16]0)
$taskWriter.Write([uint16]1)
$taskWriter.Write([uint16]1)
$taskWriter.Write([byte]0)
$taskWriter.Write([byte]0)
$taskWriter.Write([byte]0)
$taskWriter.Write([byte]0)
$taskWriter.Write([uint16]1)
$taskWriter.Write([uint16]32)
$taskWriter.Write([uint32]$taskPng.Length)
$taskWriter.Write([uint32]22)
$taskWriter.Write($taskPng)
$taskWriter.Dispose()
$taskMemory.Dispose()
$taskGraphics.Dispose()
$taskPen.Dispose()
$taskLeft.Dispose()
$taskRight.Dispose()
$taskBitmap.Dispose()
Write-Output 'Icono creado.'
