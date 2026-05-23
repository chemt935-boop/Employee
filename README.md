# HRM Backend (Node.js + SQL Server)

## Setup

1. Copy `.env.example` to `.env`
2. Fill `DB_HOST`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`
3. Install deps:

```bash
cd backend
npm.cmd install
```

4. Run:

```bash
cd backend
npm.cmd run start
```

## Flutter

- Flutter integration guide: [FLUTTER_API_GUIDE.md](file:///c:/BE/HRM/backend/FLUTTER_API_GUIDE.md)

## Auth

- `AUTH_MODE=dev` (default): send header `x-employee-id: <employee_id>`
- `AUTH_MODE=jwt`: use `POST /api/auth/login` then send `Authorization: Bearer <token>`
  - If `AUTH_MODE=jwt` you must set `JWT_SECRET` (minimum 16 characters) in `.env`

## DB Debug

- `GET /health/db`
  - Returns 200 when DB is reachable
  - Returns 503 with error + code (only in development) when DB connection fails

## Password Reset (Email Link)

1. Run SQL script to create token table:
   - [001_password_reset_tokens.sql](file:///c:/BE/HRM/backend/sql/001_password_reset_tokens.sql)
   - If you already created the table before and you get errors like “Cannot insert NULL into column 'Id'”, run:
     - [002_recreate_password_reset_tokens.sql](file:///c:/BE/HRM/backend/sql/002_recreate_password_reset_tokens.sql)
2. Configure email settings in `.env` (see Email section below).
3. Use endpoints:
   - `POST /api/auth/password-reset/request`
   - `POST /api/auth/password-reset/confirm`
4. Optional UI pages hosted by backend:
   - `GET /forgot-password`
   - `GET /reset-password?token=...`

## Endpoints (Base: `/api`)

### Auth

- `POST /auth/login` (only when `AUTH_MODE=jwt`)
  - Body:
    - `employee_id` (int) OR `email` (string)
    - `password` (string)
  - Response user fields include:
    - `direct_manager_id`, `direct_manager_name`
    - `factory_manager_id`, `factory_manager_name`
- `POST /auth/password-reset/request`
  - Body:
    - `employee_id` (int) OR `email` (string)
- `POST /auth/password-reset/confirm`
  - Body:
    - `token` (string)
    - `new_password` (string)
- `GET /auth/me`

### Employees

- `GET /employees`
- `GET /employees/:id`

### Departments

- `GET /departments`
- `POST /departments` (roles: `HR`, `CEO`, `FactoryManager`)
  - Body:
    - `department_name` (string, required)
    - `description` (string, optional)
    - `manager_id` (int, optional)

### Shifts

- `GET /shifts`
- `POST /shifts` (roles: `HR`, `CEO`, `FactoryManager`)
  - Body:
    - `shift_name` (string, required)
    - `start_time` (HH:mm or HH:mm:ss, required)
    - `end_time` (HH:mm or HH:mm:ss, required)

### Attendance

- `GET /attendance`
  - Query:
    - `from` (YYYY-MM-DD, optional, default: last 30 days)
    - `to` (YYYY-MM-DD, optional, default: today)
    - `employeeId` (int, optional)

### Dashboard

- `GET /dashboard/attendance-preview`
  - Query:
    - `month` (YYYY-MM, optional)
    - `departmentId` (int, optional)
  - Range logic:
    - If `month=2026-04` → range `2026-04-26` to `2026-05-25`
    - If `month` omitted → uses current date to pick the current cycle

### Bonus / Deductions

- `POST /bonus-deductions` (roles: `DepartmentManager`, `FactoryManager`)
  - Body:
    - `employee_id` (int, required)
    - `type` (`bonus` | `deduction`, required)
    - `value` (number, required)
    - `days` (int, required)
    - `from_date` (YYYY-MM-DD, optional)
    - `to_date` (YYYY-MM-DD, optional)
    - `status` (string, optional; default `Pending`)
- `GET /bonus-deductions`
  - Query:
    - `employeeId` (int, optional; default current user)
    - `from` (YYYY-MM-DD, optional)
    - `to` (YYYY-MM-DD, optional)

### Payroll (Preview)

- `GET /payroll/preview`
  - Query:
    - `month` (YYYY-MM, optional; default current month)
    - `employeeId` (int, optional; default current user)
    - `all` (true|false, optional; roles: `HR`, `CEO`, `FactoryManager`)

### Vacation Requests (2-step approvals)

- `GET /vacation-requests`
  - Query:
    - `employeeId` (int, optional)
    - `status` (`Pending` | `Approved` | `Rejected`, optional)
    - `from` (YYYY-MM-DD, optional)
    - `to` (YYYY-MM-DD, optional)
    - `all` (true|false, optional; roles: `HR`, `CEO`, `FactoryManager`)
- `GET /vacation-requests/inbox` (items pending your approval step)
- `POST /vacation-requests`
  - Body:
    - `vacation_type` (`Urgent` | `Annual` | `Sick`, required)
    - `start_date` (YYYY-MM-DD, required)
    - `end_date` (YYYY-MM-DD, required)
    - `reason` (string, optional)
    - `document_path` (string, optional)
    - `notes` (string, optional)
    - `deduction_type` (`balance` | `salary`, optional)
    - `employee_id` (int, optional; roles: `HR`, `CEO` only)
- `POST /vacation-requests/:id/approve`
- `POST /vacation-requests/:id/reject`
  - Body:
    - `notes` (string, optional)

### Permissions Requests (2-step approvals)

- `GET /permissions`
  - Query:
    - `employeeId` (int, optional)
    - `status` (`Pending` | `Approved` | `Rejected`, optional)
    - `dateFrom` (YYYY-MM-DD, optional)
    - `dateTo` (YYYY-MM-DD, optional)
    - `all` (true|false, optional; roles: `HR`, `CEO`, `FactoryManager`)
- `GET /permissions/inbox`
- `POST /permissions`
  - Body:
    - `permission_date` (YYYY-MM-DD, required)
    - `permission_type` (string, required)
    - `start_time` (string, optional)
    - `end_time` (string, optional)
    - `hours_requested` (number, optional)
    - `reason` (string, optional)
    - `additional_info` (string, optional)
    - `employee_id` (int, optional; roles: `HR`, `CEO` only)
- `POST /permissions/:id/approve`
- `POST /permissions/:id/reject`

### Device Tokens

- `GET /device-tokens`
- `POST /device-tokens/register`
  - Body:
    - `token` (string, required)
    - `platform` (int, required)
- `DELETE /device-tokens/:id`

### Notifications

- `POST /notifications/send` (roles: `HR`, `CEO`, `FactoryManager`)
  - Body (choose one target):
    - Send to one: `employee_id` (int)
    - Send to all: `all` (true)
  - Body (message):
    - `title` (string, required)
    - `body` (string, required)
    - `type` (string, optional)
    - `data` (object, optional)

## Required Secrets / Keys (do not commit)

### Email (password reset)

Set these in `backend/.env`:
- `EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_SECURE`
- `EMAIL_USER`, `EMAIL_PASS`, `EMAIL_FROM`
- `APP_BASE_URL` (used to build reset link)

If you use Gmail:
- Enable 2FA on the Gmail account
- Create an “App Password”
- Put the app password in `EMAIL_PASS`

### Firebase FCM (notifications)

To send push notifications with FCM you will need:
- `FIREBASE_SERVICE_ACCOUNT_JSON` = absolute path to your Firebase service account JSON file
  - Example: `C:\\keys\\your-project-firebase-adminsdk.json`

Never commit the JSON key file. Put it outside the repo and reference it by path in `.env`.
