# Shivagri Development Skill

## Overview
This skill provides comprehensive guidelines for developing the Shivagri farm management and soil testing application. It ensures consistent development practices, prevents production issues, and maintains top-tier UX/UI standards.

## Technology Stack
- **Frontend**: Angular 20.3.0
- **Backend**: Node.js/Express
- **Database**: MongoDB
- **Infrastructure**: Docker, Hostinger VPS, Google Cloud Services
- **Project Management**: Linear

---

## CRITICAL RULES (NON-NEGOTIABLE)

### 1. PRODUCTION SERVER ACCESS - ABSOLUTE PROHIBITION
**NEVER log into the production server under ANY circumstances.**

- This rule applies EVEN in bypass permission mode
- Always ask for explicit permission before any server access attempt
- If a task seems to require production server access, STOP and inform the user
- Suggest alternative approaches that don't involve production access
- Production server operations must be performed manually by the developer

**Example responses when server access is requested:**
```
I need to access the production server to complete this task. However, per Shivagri development 
guidelines, I am not permitted to log into production servers. 

Would you like me to:
1. Provide the exact commands you should run manually
2. Create a script you can review and execute
3. Suggest an alternative approach
```

### 2. GIT WORKFLOW - NO AUTOMATIC COMMITS OR PUSHES
**NEVER commit or push code automatically.**

- Make all code changes as requested
- Leave changes in working directory for developer review
- Wait for explicit approval before any git operations
- The developer maintains full control over commits and pushes

**Standard workflow:**
1. Make code changes
2. Show summary of changes made
3. Wait for developer to review
4. Developer commits and pushes manually

**When changes are complete, say:**
```
Changes completed. Files modified:
- src/app/components/...
- src/app/services/...

Please review the changes. When ready, you can:
git add .
git commit -m "Your commit message"
git push
```

### 3. BRANCH MANAGEMENT - TICKET-BASED WORKFLOW
**When user says "start working on ticket [TICKET_NUMBER]" or "please start working on this ticket":**

**Step-by-step protocol:**
1. Check current branch
2. Determine target branch name: `feature/[TICKET_NUMBER]` (e.g., `feature/shi36`)
3. If already on the correct branch → proceed with work
4. If NOT on the correct branch:
   ```bash
   # Save any uncommitted work
   git stash
   
   # Switch to main and pull latest
   git checkout main
   git pull origin main
   
   # Create and switch to new feature branch
   git checkout -b feature/[TICKET_NUMBER]
   
   # Restore stashed work if needed
   git stash pop
   ```

**Examples:**
- Ticket SHI-36 → Branch: `feature/shi36`
- Ticket SHI-142 → Branch: `feature/shi142`
- Already on `feature/shi36` working on SHI-36 → No branch switch needed

**Before starting work, confirm:**
```
Current branch: [branch_name]
Target branch for [TICKET_NUMBER]: feature/[ticket_number]

[If switch needed] Switching to main, pulling latest, and creating feature/[ticket_number]
[If already correct] Already on correct branch, proceeding with work.
```

### 4. NO DOCUMENTATION CREATION - ABSOLUTE RULE
**DO NOT create any documentation files (.md, .txt, README, etc.) unless EXPLICITLY requested.**

- This rule saves valuable context tokens
- NEVER create documentation automatically
- NEVER create README files, CHANGELOG files, or any markdown documentation
- NEVER generate API documentation, usage guides, or setup instructions
- Exception: ONLY create documentation when user explicitly says "create documentation for X" or "write a README for Y"

**What NOT to do:**
```
❌ Creating README.md...
❌ Creating DOCUMENTATION.md...
❌ Creating API_GUIDE.md...
❌ Creating CHANGELOG.md...
```

**What TO do:**
```
✅ Code changes completed. [Brief summary in chat]
✅ Feature implemented. [Quick list of what was done]
```

**If you think documentation would be helpful, suggest it:**
```
Changes complete. Would you like me to create documentation for this feature?
```

### 5. NO TEST CASE WRITING - ABSOLUTE RULE
**DO NOT write any test cases unless EXPLICITLY requested.**

- This rule saves valuable context tokens
- The developer will write tests manually
- NEVER create .spec.ts files
- NEVER create test files of any kind
- NEVER write unit tests, integration tests, or e2e tests
- Exception: ONLY write tests when user explicitly says "write tests for X" or "create test cases"

**Do NOT create or modify:**
- *.spec.ts files
- *.test.ts files
- *.spec.js files
- Test suites or test cases of any kind

**What to do instead:**
- Write production code only
- Ensure code is testable (but don't write the tests)
- Leave testing to the developer

### 6. NO TESTING OR RUNNING - ABSOLUTE RULE
**DO NOT perform any testing or run the application unless EXPLICITLY requested.**

- This rule saves time and context tokens
- NEVER run `npm start` or `ng serve`
- NEVER run `npm run build`
- NEVER run `npm test`
- NEVER make API calls to test functionality
- NEVER start the development server
- NEVER perform manual testing
- NEVER check if the application builds successfully
- Exception: ONLY perform testing when user explicitly says "test this" or "run the app"

**Commands to AVOID:**
```bash
❌ npm start
❌ ng serve
❌ npm run build
❌ npm test
❌ ng test
❌ npm run lint
❌ curl http://localhost:4200/api/...
❌ node server.js
```

**What TO do:**
- Write the code changes
- Show a brief summary of what was implemented
- Let the developer handle all testing and verification

**Standard completion message:**
```
✅ Implementation complete

Modified files:
- src/app/feature/component.ts
- src/app/feature/component.html

Changes:
- Added X functionality
- Updated Y logic
- Implemented Z feature

Ready for your review and testing.
```

---

## UX/UI EXCELLENCE - NON-NEGOTIABLE STANDARDS

### Design Philosophy
Shivagri's UX must be **top-of-the-game** with **ZERO compromise** on quality.

### Core Principles
1. **User-Friendly**: Intuitive navigation, clear CTAs, minimal cognitive load
2. **Fully Responsive**: Perfect rendering on ALL devices
3. **Modern Aesthetics**: Contemporary design language
4. **Smooth Animations**: Professional, purposeful motion
5. **Accessibility**: WCAG 2.1 AA compliant

### Responsive Breakpoints
```css
/* Mobile First Approach */

/* Extra Small Devices (Portrait Phones) */
@media (max-width: 575.98px) {
  /* Optimized for phones 320px-575px */
  .container { padding: 12px; }
  .font-base { font-size: 14px; }
  .btn { padding: 10px 16px; }
}

/* Small Devices (Landscape Phones, Small Tablets) */
@media (min-width: 576px) and (max-width: 767.98px) {
  /* Optimized for 576px-767px */
  .container { padding: 16px; }
  .font-base { font-size: 15px; }
}

/* Medium Devices (Tablets) - PRIMARY TARGET for Shivagri */
@media (min-width: 768px) and (max-width: 991.98px) {
  /* Optimized for tablets 768px-991px */
  .container { padding: 20px; }
  .font-base { font-size: 16px; }
  .grid-layout { grid-template-columns: repeat(2, 1fr); }
}

/* Large Devices (Laptops) */
@media (min-width: 992px) and (max-width: 1199.98px) {
  /* Optimized for laptops 992px-1199px */
  .container { padding: 24px; }
  .grid-layout { grid-template-columns: repeat(3, 1fr); }
}

/* Extra Large Devices (Desktops) */
@media (min-width: 1200px) and (max-width: 1599.98px) {
  /* Optimized for standard desktops */
  .container { padding: 32px; }
  .grid-layout { grid-template-columns: repeat(4, 1fr); }
}

/* Ultra Large Devices (Large Desktops) */
@media (min-width: 1600px) {
  /* Optimized for 1600px+ screens */
  .container { max-width: 1600px; margin: 0 auto; }
  .grid-layout { grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); }
}
```

### Tablet-First Considerations
Since Shivagri is used for field work, **tablet optimization is CRITICAL**:

```css
/* Tablet-specific optimizations */
@media (min-width: 768px) and (max-width: 1024px) {
  /* Larger touch targets for field use */
  .btn, .input, .select {
    min-height: 48px;
    min-width: 48px;
  }
  
  /* Adequate spacing for gloved/dirty hands */
  .interactive-element {
    margin: 12px;
  }
  
  /* High contrast for outdoor visibility */
  .card {
    border: 2px solid #e0e0e0;
    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.15);
  }
  
  /* Landscape orientation support */
  @media (orientation: landscape) {
    .form-layout {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 20px;
    }
  }
}
```

### Modern UI Component Standards

#### Buttons
```css
.btn-primary {
  /* Modern gradient with depth */
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  border: none;
  border-radius: 8px;
  padding: 12px 24px;
  font-weight: 600;
  letter-spacing: 0.5px;
  
  /* Smooth transitions */
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  
  /* Subtle shadow */
  box-shadow: 0 4px 6px rgba(50, 50, 93, 0.11), 
              0 1px 3px rgba(0, 0, 0, 0.08);
}

.btn-primary:hover {
  transform: translateY(-2px);
  box-shadow: 0 7px 14px rgba(50, 50, 93, 0.1), 
              0 3px 6px rgba(0, 0, 0, 0.08);
}

.btn-primary:active {
  transform: translateY(0);
}
```

#### Cards
```css
.card {
  background: #ffffff;
  border-radius: 12px;
  padding: 24px;
  
  /* Modern shadow system */
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.12), 
              0 1px 2px rgba(0, 0, 0, 0.24);
  
  transition: all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
}

.card:hover {
  box-shadow: 0 14px 28px rgba(0, 0, 0, 0.25), 
              0 10px 10px rgba(0, 0, 0, 0.22);
  transform: translateY(-4px);
}
```

#### Inputs
```css
.input-modern {
  border: 2px solid #e0e0e0;
  border-radius: 8px;
  padding: 12px 16px;
  font-size: 16px;
  transition: all 0.3s ease;
  
  /* Prevent zoom on mobile */
  @media (max-width: 767.98px) {
    font-size: 16px; /* Prevents iOS zoom */
  }
}

.input-modern:focus {
  border-color: #667eea;
  outline: none;
  box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
}
```

#### Navigation
```css
.navbar {
  background: #ffffff;
  border-bottom: 1px solid #e0e0e0;
  padding: 16px 24px;
  
  /* Sticky with blur effect */
  position: sticky;
  top: 0;
  backdrop-filter: blur(10px);
  background: rgba(255, 255, 255, 0.95);
  z-index: 1000;
  
  /* Smooth shadow on scroll */
  transition: box-shadow 0.3s ease;
}

.navbar.scrolled {
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}
```

### Animation Standards

#### Page Transitions
```typescript
// Angular animation example
export const fadeSlideIn = trigger('fadeSlideIn', [
  transition(':enter', [
    style({ opacity: 0, transform: 'translateY(20px)' }),
    animate('300ms cubic-bezier(0.4, 0, 0.2, 1)', 
      style({ opacity: 1, transform: 'translateY(0)' })
    )
  ])
]);
```

#### Loading States
```css
/* Modern skeleton loader */
.skeleton {
  background: linear-gradient(
    90deg,
    #f0f0f0 25%,
    #e0e0e0 50%,
    #f0f0f0 75%
  );
  background-size: 200% 100%;
  animation: skeleton-loading 1.5s ease-in-out infinite;
}

@keyframes skeleton-loading {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}
```

#### Micro-interactions
```css
/* Button ripple effect */
.btn-ripple {
  position: relative;
  overflow: hidden;
}

.btn-ripple::after {
  content: '';
  position: absolute;
  top: 50%;
  left: 50%;
  width: 0;
  height: 0;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.5);
  transform: translate(-50%, -50%);
  transition: width 0.6s, height 0.6s;
}

.btn-ripple:active::after {
  width: 300px;
  height: 300px;
}
```

### Accessibility Requirements
```css
/* Focus visible for keyboard navigation */
*:focus-visible {
  outline: 2px solid #667eea;
  outline-offset: 2px;
}

/* High contrast mode support */
@media (prefers-contrast: high) {
  .btn-primary {
    border: 2px solid currentColor;
  }
}

/* Reduced motion for accessibility */
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

---

## Development Workflow

### Starting a New Ticket
1. User says: "start working on ticket SHI-XX"
2. Check/switch to correct branch (feature/shiXX)
3. Review ticket requirements in Linear
4. Break down into implementation steps
5. Confirm approach with user
6. Implement with UX standards
7. Show changes summary
8. Wait for user review and commit

### Code Quality Standards
- **TypeScript**: Strict mode enabled, no `any` types
- **Angular**: Follow official style guide, use OnPush change detection
- **Performance**: Lazy load modules, optimize bundle size
- **Accessibility**: ARIA labels, keyboard navigation, screen reader support

### File Naming Conventions
```
components/
  ├── farm-management/
  │   ├── farm-management.component.ts
  │   ├── farm-management.component.html
  │   └── farm-management.component.scss
  ├── soil-testing/
  └── shared/
      ├── ui/
      └── forms/

Note: Test files (.spec.ts) are not created automatically - developer writes tests manually.
```

---

## Error Handling

### User Feedback
Always provide clear, actionable error messages:

```typescript
// Good
this.toastr.error(
  'Unable to save farm data. Please check your internet connection.',
  'Save Failed'
);

// Bad
this.toastr.error('Error occurred');
```

### Loading States
Show loading indicators for all async operations:

```html
<button [disabled]="isLoading" (click)="saveFarm()">
  <span *ngIf="!isLoading">Save Farm</span>
  <span *ngIf="isLoading">
    <i class="spinner"></i> Saving...
  </span>
</button>
```

---

## IMPORTANT REMINDERS

### What NOT to Do (Token Saving Measures)
1. ❌ **NO Documentation** - Don't create any .md files unless explicitly asked
2. ❌ **NO Test Cases** - Don't write .spec.ts or any test files unless explicitly asked
3. ❌ **NO Testing/Running** - Don't run npm commands, build, or test unless explicitly asked
4. ❌ **NO Commits** - Don't commit or push; leave for developer review
5. ❌ **NO Production Access** - Never log into production servers

### What TO Do
1. ✅ **Write production code only** - Implement the feature/fix requested
2. ✅ **Apply UX standards** - Follow the responsive design and modern UI guidelines
3. ✅ **Show brief summary** - List modified files and key changes
4. ✅ **Wait for review** - Let developer test, commit, and push

---

## Communication Standards

### When Starting Work
```
Starting work on ticket [TICKET_NUMBER]: [Ticket Title]

Current branch: [branch_name]
Switched to: feature/[ticket_number]

Implementation plan:
1. [Step 1]
2. [Step 2]
3. [Step 3]

Proceeding with implementation...
```

### When Changes Complete
```
✅ Implementation complete for [TICKET_NUMBER]

Files modified:
- [file1]
- [file2]
- [file3]

Key changes:
- [Change 1]
- [Change 2]
- [Change 3]

Ready for your review and testing.

When ready to commit:
git add .
git commit -m "[Your commit message]"
git push
```

### When Blocked or Need Input
```
⚠️ Need input on [TICKET_NUMBER]

Current progress:
- ✅ [Completed item]
- ⏳ [In progress]
- ❓ [Blocker/Question]

Question: [Clear, specific question]

Options:
1. [Option 1]
2. [Option 2]

What would you prefer?
```

---

## Special Considerations for Shivagri

### Field Work Optimization
- **Touch targets**: Minimum 48x48px for tablet use
- **Contrast**: High contrast for outdoor visibility
- **Loading**: Show clear progress for slow connections
- **Offline**: Consider offline-first approach for field areas
- **Forms**: Auto-save drafts, minimal required fields

### Multilingual Support
- Gujarati font support (Noto Sans Gujarati)
- RTL layout consideration if needed
- Clear font rendering in PDF reports

### Agricultural Context
- Use familiar terminology for farmers
- Include helpful tooltips and guidance
- Visual indicators (icons, colors) for soil health, fertilizer levels
- Clear data visualization for test results

---

## FINAL CHECKLIST

Before marking any ticket complete:

- [ ] All code changes made as requested
- [ ] UX is modern, responsive, and accessible
- [ ] NO documentation files created (.md, README, etc.)
- [ ] NO test cases written (.spec.ts, .test.ts, etc.)
- [ ] NO testing or running performed (npm commands, builds, etc.)
- [ ] NO production server access attempted
- [ ] NO automatic commits/pushes made
- [ ] Brief changes summary provided to user
- [ ] Waiting for user review and approval

---

## Remember

**This skill ensures Shivagri maintains professional development standards while delivering an exceptional user experience. Every line of code should reflect our commitment to quality, safety, and user satisfaction.**

**CRITICAL - SIX ABSOLUTE RULES:**
1. ❌ NO production server access (EVER)
2. ❌ NO automatic commits or pushes
3. ❌ NO documentation creation (unless explicitly requested)
4. ❌ NO test case writing (unless explicitly requested)
5. ❌ NO testing or running (unless explicitly requested)
6. ✅ ALWAYS provide brief summaries and wait for developer review

**NO COMPROMISE on UX. NO EXCEPTIONS on production access. NO WASTED TOKENS on docs/tests.**
