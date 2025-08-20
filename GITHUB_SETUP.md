# GitHub Repository Setup Guide

This guide will help you upload the NWS Weather Alerts Slack App to GitHub for better version control.

## Prerequisites

- Git installed on your system
- GitHub account
- GitHub CLI (optional but recommended)

## Step 1: Initialize Git Repository

```bash
cd /Users/davidbrown/Desktop/weather-alerts
git init
```

## Step 2: Add Files to Git

The `.gitignore` file has been configured to exclude sensitive data and unnecessary files:

```bash
git add .
git status  # Review what will be committed
```

## Step 3: Create Initial Commit

```bash
git commit -m "Initial commit: NWS Weather Alerts Slack App

🚀 Features:
- Real-time weather alert monitoring from NWS CAP feeds
- Slack Socket Mode integration with Block Kit UI
- Production-ready with 24/7 monitoring and auto-restart
- Admin interface for feed management
- CAP XML parsing with TypeScript
- Bergen County zones (NJZ103, NJZ104) pre-configured

🤖 Generated with Claude Code"
```

## Step 4: Create GitHub Repository

### Option A: Using GitHub CLI (Recommended)
```bash
gh repo create nws-weather-alerts-slack --public --description "Mission-critical Slack app monitoring NWS weather alerts with enterprise reliability"
git remote add origin https://github.com/YOUR_USERNAME/nws-weather-alerts-slack.git
git branch -M main
git push -u origin main
```

### Option B: Using GitHub Web Interface
1. Go to https://github.com/new
2. Repository name: `nws-weather-alerts-slack`
3. Description: `Mission-critical Slack app monitoring NWS weather alerts with enterprise reliability`
4. Choose Public or Private
5. Don't initialize with README (we already have one)
6. Click "Create repository"

Then connect your local repo:
```bash
git remote add origin https://github.com/YOUR_USERNAME/nws-weather-alerts-slack.git
git branch -M main
git push -u origin main
```

## Step 5: Verify Upload

1. Check that all files are uploaded correctly
2. Verify the README displays properly
3. Ensure sensitive files (.env, data/, logs/) are not included

## Security Notes

✅ **Safe to commit:**
- Source code files
- Configuration templates
- Documentation
- Package files
- Manifest files

❌ **Never commit:**
- `.env` files with tokens
- `data/` directory with subscription data  
- `logs/` directory with service logs
- Any files containing Slack tokens or secrets

## Repository Structure

Your GitHub repository will include:
- Core application files (app.js, app-production.js)
- TypeScript source code and configuration
- Slack app manifest and setup guides
- Production deployment scripts
- Comprehensive documentation

## Next Steps

1. Set up branch protection rules
2. Configure issue templates
3. Add GitHub Actions for CI/CD (optional)
4. Create releases for version management

## Troubleshooting

**If git commands fail:**
- Ensure you're in the correct directory
- Check Git is installed: `git --version`
- Verify GitHub CLI is installed: `gh --version`

**If sensitive data is accidentally committed:**
```bash
# Remove from staging
git reset HEAD filename

# Remove from history (if already committed)
git filter-branch --force --index-filter 'git rm --cached --ignore-unmatch filename' --prune-empty --tag-name-filter cat -- --all
```

**Repository already exists:**
```bash
git remote set-url origin https://github.com/YOUR_USERNAME/nws-weather-alerts-slack.git
```