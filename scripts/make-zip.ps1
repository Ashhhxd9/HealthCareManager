# PowerShell script to package source code into healthcare-manager.zip

$projectDir = "C:\Users\as998\.gemini\antigravity\scratch\healthcare-manager"
$tempDir = "C:\Users\as998\.gemini\antigravity\scratch\temp-zip-build"
$zipPath = "C:\Users\as998\.gemini\antigravity\scratch\healthcare-manager.zip"

Write-Host "Creating clean build directory..."
if (Test-Path $tempDir) {
    Remove-Item -Recurse -Force $tempDir
}
New-Item -ItemType Directory -Path $tempDir | Out-Null
New-Item -ItemType Directory -Path "$tempDir\src" | Out-Null
New-Item -ItemType Directory -Path "$tempDir\prisma" | Out-Null
New-Item -ItemType Directory -Path "$tempDir\scripts" | Out-Null

Write-Host "Copying files..."
Copy-Item -Recurse "$projectDir\src\*" "$tempDir\src\"
Copy-Item "$projectDir\prisma\schema.prisma" "$tempDir\prisma\"
if (Test-Path "$projectDir\prisma\migrations") {
    Copy-Item -Recurse "$projectDir\prisma\migrations" "$tempDir\prisma\"
}
Copy-Item -Recurse "$projectDir\scripts\*" "$tempDir\scripts\" -Exclude "make-zip.ps1"

$rootFiles = @(
    "package.json",
    "package-lock.json",
    "tsconfig.json",
    "next.config.ts",
    "eslint.config.mjs",
    "postcss.config.mjs",
    "system_design.md",
    "README.md",
    ".env.example"
)

foreach ($file in $rootFiles) {
    if (Test-Path "$projectDir\$file") {
        Copy-Item "$projectDir\$file" "$tempDir\"
    }
}

Write-Host "Zipping archive..."
if (Test-Path $zipPath) {
    Remove-Item $zipPath
}
Compress-Archive -Path "$tempDir\*" -DestinationPath $zipPath -Force

Write-Host "Cleaning up build directory..."
Remove-Item -Recurse -Force $tempDir

Write-Host "Clean zip package created at: $zipPath"
