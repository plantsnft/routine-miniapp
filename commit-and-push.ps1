# PowerShell script to commit and push changes
# Usage: .\commit-and-push.ps1 "Your commit message"

param(
    [Parameter(Mandatory=$false)]
    [string]$Message = "Update: Auto-commit from script"
)

Write-Host "Staging all changes..." -ForegroundColor Yellow
git add -A

Write-Host "Committing changes..." -ForegroundColor Yellow
git commit -m $Message

Write-Host "Pushing to remote..." -ForegroundColor Yellow
git push

Write-Host "Done!" -ForegroundColor Green

