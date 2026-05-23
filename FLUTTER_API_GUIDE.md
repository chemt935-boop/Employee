# Flutter API Guide (HRM Backend)

## Base URL

Your backend runs on port `3000`.

- Windows browser on same PC: `http://localhost:3000`
- Android Emulator: `http://10.0.2.2:3000`
- iOS Simulator: `http://localhost:3000`
- Real phone on same Wi‑Fi: `http://10.10.10.139:3000`

API base:
- `{{baseUrl}}/api`

Health checks:
- `GET {{baseUrl}}/health`
- `GET {{baseUrl}}/health/db`

## Auth

The backend supports 2 modes:

### A) JWT mode (recommended)

Set in `.env`:
- `AUTH_MODE=jwt`
- `JWT_SECRET=...` (min 16 chars)

#### Login

`POST {{baseUrl}}/api/auth/login`

Body:
```json
{
  "employee_id": 201225,
  "password": "yourPassword"
}
```

Response:
```json
{
  "token": "...",
  "user": {
    "employee_id": 201225,
    "name": "Name",
    "email": "email@x.com",
    "role": "Engineer",
    "department_id": 2,
    "direct_manager_id": 123,
    "direct_manager_name": "Manager Name",
    "factory_manager_id": 456,
    "factory_manager_name": "Factory Manager Name"
  }
}
```

Use this header for all secured endpoints:
- `Authorization: Bearer <token>`

### B) DEV mode (for quick testing)

Set in `.env`:
- `AUTH_MODE=dev`

No login endpoint in this mode. Use header:
- `x-employee-id: <employee_id>`

## Password Reset (Email Link + UI)

### 1) Request reset link

`POST {{baseUrl}}/api/auth/password-reset/request`

Body (choose one):
```json
{ "employee_id": 201225 }
```
or
```json
{ "email": "user@company.com" }
```

If email is configured, the backend sends a link like:
- `{{baseUrl}}/reset-password?token=...`

UI pages (web):
- `GET {{baseUrl}}/forgot-password`
- `GET {{baseUrl}}/reset-password?token=...`

### 2) Confirm reset (from Flutter)

`POST {{baseUrl}}/api/auth/password-reset/confirm`

Body:
```json
{
  "token": "token-from-email-link",
  "new_password": "NewPassword123"
}
```

## Endpoints you will call from Flutter

### Employees
- `GET /api/employees`
- `GET /api/employees/:id`

### Departments
- `GET /api/departments`
- `POST /api/departments` (roles: HR, CEO, FactoryManager)

### Shifts
- `GET /api/shifts`
- `POST /api/shifts` (roles: HR, CEO, FactoryManager)
  - Body:
    - `shift_name` (string)
    - `start_time` (HH:mm or HH:mm:ss)
    - `end_time` (HH:mm or HH:mm:ss)

### Attendance (range)
- `GET /api/attendance?from=YYYY-MM-DD&to=YYYY-MM-DD`
- `GET /api/attendance?employeeId=201225&from=YYYY-MM-DD&to=YYYY-MM-DD`

### Dashboard preview (cycle 26 → 25)
- `GET /api/dashboard/attendance-preview?month=YYYY-MM`

Example:
- `month=2026-04` => `2026-04-26` to `2026-05-25`

### Payroll preview
- `GET /api/payroll/preview?month=YYYY-MM`
- Admin: `GET /api/payroll/preview?month=YYYY-MM&all=true`

### Bonus / Deductions
- `POST /api/bonus-deductions` (roles: DepartmentManager, FactoryManager)
- `GET /api/bonus-deductions?employeeId=...`

### Vacation Requests
- `POST /api/vacation-requests`
- `GET /api/vacation-requests`
- `GET /api/vacation-requests/inbox` (approvals)
- `POST /api/vacation-requests/:id/approve`
- `POST /api/vacation-requests/:id/reject`

### Permissions Requests
- `POST /api/permissions`
- `GET /api/permissions`
- `GET /api/permissions/inbox`
- `POST /api/permissions/:id/approve`
- `POST /api/permissions/:id/reject`

### Notifications (FCM)

#### 1) Register device token (required to receive push)

`POST /api/device-tokens/register`

Body:
```json
{
  "token": "fcm-device-token",
  "platform": 1
}
```

Platform:
- `1` Android
- `2` iOS

#### 2) Workflow notifications (automatic)

When you create/approve/reject in these modules, the backend sends push notifications:
- Vacation requests:
  - `vacation_request.created` → sent to Direct Manager
  - `vacation_request.needs_fm_approval` → sent to Factory Manager (after DM approval)
  - `vacation_request.approved` → sent to Employee (after final approval)
  - `vacation_request.rejected` → sent to Employee
- Permissions:
  - `permission_request.created` → sent to Direct Manager
  - `permission_request.needs_fm_approval` → sent to Factory Manager (after DM approval)
  - `permission_request.approved` → sent to Employee (after final approval)
  - `permission_request.rejected` → sent to Employee

Payload shape:
```json
{
  "notification": { "title": "....", "body": "...." },
  "data": {
    "type": "vacation_request.created",
    "request_id": "123",
    "employee_id": "201225"
  }
}
```

#### 3) Admin send (Postman)

`POST /api/notifications/send` (roles: HR, CEO, FactoryManager)

Send to one employee:
```json
{
  "employee_id": 201225,
  "title": "Message title",
  "body": "Message body",
  "type": "admin.message",
  "data": { "screen": "home" }
}
```

Broadcast to all employees (who registered device tokens):
```json
{
  "all": true,
  "title": "Announcement",
  "body": "Company-wide message",
  "type": "admin.broadcast",
  "data": { "screen": "announcements" }
}
```

## Flutter implementation (recommended structure)

### Packages

- `http` (simple)
- `shared_preferences` (store token)

### ApiClient (http)

```dart
import 'dart:convert';
import 'package:http/http.dart' as http;

class ApiClient {
  ApiClient({required this.baseUrl, required this.getToken});

  final String baseUrl;
  final Future<String?> Function() getToken;

  Future<Map<String, dynamic>> getJson(String path, {Map<String, String>? query}) async {
    final token = await getToken();
    final uri = Uri.parse('$baseUrl$path').replace(queryParameters: query);
    final res = await http.get(uri, headers: _headers(token));
    return _handle(res);
  }

  Future<Map<String, dynamic>> postJson(String path, Object body) async {
    final token = await getToken();
    final uri = Uri.parse('$baseUrl$path');
    final res = await http.post(uri, headers: _headers(token), body: jsonEncode(body));
    return _handle(res);
  }

  Map<String, String> _headers(String? token) {
    final h = <String, String>{'Content-Type': 'application/json'};
    if (token != null && token.isNotEmpty) h['Authorization'] = 'Bearer $token';
    return h;
  }

  Map<String, dynamic> _handle(http.Response res) {
    final data = res.body.isEmpty ? <String, dynamic>{} : jsonDecode(res.body) as Map<String, dynamic>;
    if (res.statusCode >= 200 && res.statusCode < 300) return data;
    final msg = (data['error'] as String?) ?? 'Request failed';
    throw ApiException(res.statusCode, msg);
  }
}

class ApiException implements Exception {
  ApiException(this.statusCode, this.message);
  final int statusCode;
  final String message;
  @override
  String toString() => 'ApiException($statusCode): $message';
}
```

### Login example

```dart
final api = ApiClient(
  baseUrl: 'http://10.0.2.2:3000',
  getToken: () async => null,
);

final res = await api.postJson('/api/auth/login', {
  'employee_id': 201225,
  'password': 'yourPassword',
});

final token = res['token'] as String;
```

### Call secured endpoint example

```dart
final api = ApiClient(
  baseUrl: 'http://10.0.2.2:3000',
  getToken: () async => tokenFromStorage,
);

final employees = await api.getJson('/api/employees');
```

### Attendance range example

```dart
final res = await api.getJson('/api/attendance', query: {
  'from': '2026-04-26',
  'to': '2026-05-25',
  'employeeId': '201225',
});
```

## Common issues

- `localhost` from mobile/emulator does not point to your PC. Use `10.0.2.2` (Android emulator) or your PC LAN IP.
- If `/health/db` returns 503, DB is not reachable from backend. Fix `.env` DB settings or SQL permissions.
- SQL Server `time` columns (like `check_in`, `check_out`) are returned as `HH:mm:ss` strings (not `1970-01-01...`).
- Lateness is calculated after a 15-minute grace period from shift start time.
