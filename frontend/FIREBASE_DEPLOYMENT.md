# Firebase Deployment Instructions

This guide provides step-by-step instructions to deploy the Angular frontend application to Firebase Hosting.

## Prerequisites

Before you begin, ensure you have:
- Node.js and npm installed
- A Google account
- Firebase CLI installed globally

## Step 1: Install Firebase CLI

If you haven't already installed Firebase CLI, run:

```bash
npm install -g firebase-tools
```

## Step 2: Login to Firebase

Authenticate with your Google account:

```bash
firebase login
```

This will open a browser window for you to sign in with your Google account.

## Step 3: Initialize Firebase in Your Project

Navigate to your project directory:

```bash
cd /Users/mahirratanpara/IdeaProjects/shiv-agri/frontend
```

Initialize Firebase:

```bash
firebase init
```

When prompted, select the following options:

1. **Which Firebase features do you want to set up?**
   - Select: `Hosting: Configure files for Firebase Hosting and (optionally) set up GitHub Action deploys`
   - Use spacebar to select, then press Enter

2. **Please select an option:**
   - Select: `Use an existing project` (if you have one) or `Create a new project`

3. **What do you want to use as your public directory?**
   - Enter: `dist/frontend/browser` (this is where Angular builds the production files)

4. **Configure as a single-page app (rewrite all urls to /index.html)?**
   - Enter: `Yes`

5. **Set up automatic builds and deploys with GitHub?**
   - Enter: `No` (unless you want to set up CI/CD with GitHub)

6. **File dist/frontend/browser/index.html already exists. Overwrite?**
   - Enter: `No`

## Step 4: Build Your Angular Application

Build the Angular application for production:

```bash
npm run build
```

This will create optimized production files in the `dist/frontend/browser` directory.

## Step 5: Deploy to Firebase

Deploy your application to Firebase Hosting:

```bash
firebase deploy
```

After deployment completes, Firebase will provide you with:
- **Hosting URL**: Your live website URL (e.g., `https://your-project.web.app`)
- **Console URL**: Link to Firebase Console to manage your project

## Step 6: Verify Deployment

Open the provided Hosting URL in your browser to verify the deployment was successful.

## Future Deployments

For subsequent deployments, simply run:

```bash
# Build the application
npm run build

# Deploy to Firebase
firebase deploy
```

## Firebase Configuration File

After initialization, you'll have a `firebase.json` file in your project root that looks like this:

```json
{
  "hosting": {
    "public": "dist/frontend/browser",
    "ignore": [
      "firebase.json",
      "**/.*",
      "**/node_modules/**"
    ],
    "rewrites": [
      {
        "source": "**",
        "destination": "/index.html"
      }
    ]
  }
}
```

## Troubleshooting

### Issue: Build fails
**Solution**: Ensure all dependencies are installed:
```bash
npm install
```

### Issue: Deployment fails with "project not found"
**Solution**: Make sure you're logged in and have selected the correct project:
```bash
firebase login
firebase use --add
```

### Issue: 404 errors on page refresh
**Solution**: Ensure the `rewrites` configuration in `firebase.json` is set up correctly (this should be automatic if you selected "single-page app" during initialization).

### Issue: Old version still showing after deployment
**Solution**: Clear your browser cache or open in incognito mode. Firebase Hosting uses CDN caching.

## Custom Domain Setup (Optional)

To use a custom domain:

1. Go to Firebase Console: https://console.firebase.google.com
2. Select your project
3. Navigate to Hosting section
4. Click "Add custom domain"
5. Follow the instructions to verify domain ownership and update DNS records

## How to Change Firebase Project

If you need to switch to a different Firebase project:

### Method 1: Using Project ID/Alias

```bash
# List all available projects
firebase projects:list

# Switch to a different project by project ID
firebase use <project-id>

# Example
firebase use my-project-123
```

### Method 2: Interactive Project Selection

```bash
# Interactively select from your projects
firebase use

# This will show a list of projects to choose from
```

### Method 3: Add and Switch to New Project

```bash
# Add a new project and give it an alias
firebase use --add

# Follow prompts to:
# 1. Select the project from your Firebase projects
# 2. Give it an alias (e.g., "production", "staging", "dev")

# Example workflow:
# ? Which project do you want to add? my-new-project
# ? What alias do you want to use for this project? production
```

### Check Current Project

```bash
# See which project is currently active
firebase use

# View project info
firebase projects:list
```

### Clear Project Configuration

If you want to completely remove the Firebase configuration and start fresh:

```bash
# Remove Firebase project association
rm .firebaserc

# Re-initialize Firebase
firebase init
```

## Environment-Specific Deployments

To maintain separate environments (development, staging, production):

1. Create multiple Firebase projects in Firebase Console
2. Use different project aliases for each environment:

```bash
# Add development project
firebase use --add
# Select dev project, name it "dev"

# Add production project
firebase use --add
# Select prod project, name it "prod"

# Add staging project
firebase use --add
# Select staging project, name it "staging"

# Deploy to specific environment
firebase use dev
npm run build
firebase deploy

firebase use prod
npm run build
firebase deploy
```

### View All Project Aliases

```bash
# Check .firebaserc file
cat .firebaserc
```

This will show something like:
```json
{
  "projects": {
    "dev": "my-project-dev",
    "staging": "my-project-staging",
    "prod": "my-project-prod"
  }
}
```

## Useful Commands

```bash
# View current project
firebase projects:list

# Switch projects
firebase use <project-id>

# View hosting details
firebase hosting:channel:list

# Open Firebase Console
firebase open hosting

# View deployment history
firebase hosting:channel:list
```

## Additional Resources

- [Firebase Hosting Documentation](https://firebase.google.com/docs/hosting)
- [Angular Deployment Guide](https://angular.io/guide/deployment)
- [Firebase CLI Reference](https://firebase.google.com/docs/cli)

## Support

For issues or questions:
- Firebase Support: https://firebase.google.com/support
- Angular Support: https://angular.io/guide/setup-local#getting-help

---

**Last Updated**: 2025-10-26
**Project**: Shiv Agri Consultancy & Laboratory
**Framework**: Angular 20.3.0
