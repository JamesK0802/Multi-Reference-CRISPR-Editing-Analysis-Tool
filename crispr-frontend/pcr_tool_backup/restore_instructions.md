# PCR Setup Calculator Restore Instructions

If you have rolled back the repository and want to reinstall the PCR Setup Calculator tool exactly as it was, follow these steps.

## 🚀 One-shot Restore Prompt
You can paste the following prompt into your AI coding assistant (like Antigravity) to automate the restoration:

> "I need to restore the PCR Setup Calculator tool from the `pcr_tool_backup` folder.
> 1. Copy `pcr_tool_backup/src/app/tools/pcr-calculator/` to `src/app/tools/pcr-calculator/`.
> 2. Copy `pcr_tool_backup/src/app/services/pcr-calculator.service.ts` to `src/app/services/pcr-calculator.service.ts`.
> 3. Add the route `{ path: 'tools/pcr', loadComponent: () => import('./tools/pcr-calculator/pcr-calculator').then(m => m.PcrCalculatorComponent) }` to `src/app/app.routes.ts`.
> 4. In `src/app/app.html`, add the 'Tools' dropdown menu with a link to `/tools/pcr`.
> 5. Append the dropdown CSS styles from the backup documentation to `src/app/app.css`.
> 6. Ensure `jspdf` and `jspdf-autotable` are installed in `package.json`."

---

## 🛠 Manual Step-by-Step Integration

### 1. File Restoration
Copy the files from the backup directory back to their original locations in `src/app/`.

### 2. Install Dependencies
Run the following command in the `crispr-frontend` directory:
```bash
npm install jspdf jspdf-autotable
```

### 3. Register Route
In `src/app/app.routes.ts`, add the following entry to the `routes` array:
```typescript
{
  path: 'tools/pcr',
  loadComponent: () => import('./tools/pcr-calculator/pcr-calculator').then(m => m.PcrCalculatorComponent)
},
```

### 4. Update Navigation Menu
In `src/app/app.html`, add this dropdown structure inside the `.nav-left` div:
```html
<div class="nav-dropdown">
  <span class="nav-tab" style="cursor: pointer;">Tools ▾</span>
  <div class="dropdown-content">
    <a routerLink="/tools/pcr" routerLinkActive="active" class="dropdown-item">PCR Setup Calculator</a>
  </div>
</div>
```

### 5. Add Styles
Append these styles to the end of `src/app/app.css`:
```css
/* Nav Dropdown */
.nav-dropdown {
  position: relative;
  display: inline-block;
}

.dropdown-content {
  display: none;
  position: absolute;
  top: 100%;
  left: 0;
  background-color: #fff;
  min-width: 200px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.1);
  border-radius: 8px;
  z-index: 1000;
  border: 1px solid #e2e5ea;
  padding: 8px 0;
}

.nav-dropdown:hover .dropdown-content {
  display: block;
}

.dropdown-item {
  color: #334155;
  padding: 10px 16px;
  text-decoration: none;
  display: block;
  font-size: 0.85rem;
  font-weight: 500;
}

.dropdown-item:hover, .dropdown-item.active {
  background-color: #f1f5f9;
  color: #166534;
}
```
