# תוכנית בדיקות מקיפה למערכת PTOps

מטרה: לוודא יציבות, סנכרון בין שכבת ה-API (claude-agent) לאפליקציה, נכונות מדיניות RLS, וכיסוי מקרי קצה שלא נבדקו עד היום.

## שכבות הבדיקה

```text
┌─────────────────────────────────────────────────┐
│ 4. E2E (Playwright)  — דפדפן אמיתי, משתמש חי  │
├─────────────────────────────────────────────────┤
│ 3. API Integration   — HTTP חי מול /api/public  │
├─────────────────────────────────────────────────┤
│ 2. RLS / DB          — psql כ-anon/auth/admin   │
├─────────────────────────────────────────────────┤
│ 1. Unit (Vitest)     — actions.server, schemas  │
└─────────────────────────────────────────────────┘
```

---

## 1. בדיקות יחידה (Vitest)

קובץ אחד קיים (`ptops-logic.test.ts`). נרחיב ל:

- **`src/lib/claude-agent/__tests__/schemas.test.ts`** — לכל סכמה ב-`schemas.ts`: קלט תקין, קלט חסר שדה חובה, סוג שגוי, enum לא חוקי, גבולות (תאריך לא תקין, מערך ריק, מחרוזת ארוכה מדי).
- **`src/lib/claude-agent/__tests__/actions.test.ts`** — לכל action ב-`actions.server.ts` עם Supabase client מדומה (`vi.fn()` chain). מוודא: בניית query נכונה (`eq user_id`, `neq ARCHIVED`), חישובי dashboard (mrr, overdue), טיפול בשגיאות, נירמול enums.
- **`src/lib/__tests__/ptops-logic.test.ts`** — הרחבה: מצבי קצה (תאריך null, סטטוס לא ידוע, שלב שלא קיים).

הרצה: `bunx vitest run`.

## 2. בדיקות RLS ו-DB

סקריפט `scripts/test-rls.ts` שמתחבר ל-DB דרך `SUPABASE_DB_URL` ומריץ עבור כל טבלה (`tasks`, `leads`, `dev_items`, `lead_contacts`, `business_context`, `attachments`, `user_roles`, `users`, `dev_item_updates`, `task_stages`):

- `SET ROLE anon` → ננסה SELECT/INSERT, מצפים לכשל לפי המדיניות.
- `SET ROLE authenticated; SET LOCAL "request.jwt.claims" = '{"sub":"<user-A>"}'` → קריאה/כתיבה של רשומה של User A מצליחה.
- אותו דבר כ-User B מנסה לקרוא של User A → אמור להיכשל (privilege escalation guard).
- `has_role()` — בדיקה ש-admin רואה הכל, developer רואה רק dev_items, user רגיל לא רואה user_roles של אחרים.
- בדיקת GRANTs: שאילתת `information_schema.role_table_grants` מוודאת ש-`authenticated` ו-`service_role` יש להם הרשאות בכל טבלת public, ושאין `anon SELECT` על טבלאות auth-only.
- triggers: insert/update טסק → `completed_at` מתעדכן; dev_item → `resolved_at` ו-`dev_item_updates` רץ.

## 3. בדיקות אינטגרציה ל-API (claude-agent)

סקריפט `scripts/test-api.ts` שקורא ל-`https://ops.pizantech.com/api/public/claude-agent` עם שני הטוקנים:

**Auth & אבטחה:**
- בלי `Authorization` → 401.
- טוקן שגוי → 401 (וידוא `timingSafeEq`).
- OPTIONS preflight → 200 עם CORS headers נכונים.
- שיטות GET/PUT → 405.

**טוקן אדמין (CLAUDE_AGENT_TOKEN):**
- כל פעולה ב-`VALID_ACTIONS` — smoke test (קלט מינימלי, מצפים ל-200 או שגיאת validation מובנית).
- `get_dashboard`, `list_tasks`, `list_leads`, `list_dev_items` — בדיקת מבנה תגובה.
- CRUD מלא: `create_task` → `update_task` → `complete_task` → `get_task` → `delete_task`, כל שלב מאומת.
- אותו flow ל-leads, dev_items, contacts.
- `batch` עם 25 פעולות (גבול) ועם 26 (מצפים לדחייה).
- `batch` מקונן (batch בתוך batch) → דחייה.

**טוקן Idan (IDAN_AGENT_TOKEN):**
- כל פעולה לא ב-`IDAN_ALLOWED_ACTIONS` → 403 (וידוא: `list_tasks`, `get_dashboard`, `create_lead` וכו').
- `create_dev_item` → ה-`created_by` שווה ל-user_id של Idan, לא לאדמין.
- `list_dev_items` מחזיר פריטים.
- `batch` עם פעולה אסורה בפנים → 403.

**מקרי קצה:**
- JSON לא תקין בגוף → 400.
- `action` לא ידוע → 400.
- `params` חסרים → שגיאת ולידציה ברורה.
- תאריך בפורמט שגוי, enum לא תקין, ID לא קיים (404/null), `blocked_by` עם UUID של פריט שלא קיים.
- מחיקת פריט שמשמש כ-`blocked_by` של אחר → התנהגות מוגדרת.
- `list_unblocked` אחרי שחרור חוסם.

## 4. בדיקות E2E (Playwright)

תרחישי משתמש מקצה לקצה מול ה-Preview URL:

- **התחברות**: email/password + Google OAuth (mock או חשבון בדיקה), redirect ל-`/`, יציאה מנקה state.
- **גישת dev**: משתמש developer רואה את `/dev`, לא רואה `/crm`. admin רואה הכל.
- **Tasks**: יצירה → עריכה → השלמה → ארכוב, סנכרון עם רשימה ב-realtime, רענון דף שומר state.
- **CRM**: יצירת lead, log_contact, מעבר שלבים, חישוב MRR בדשבורד.
- **Dev items**: יצירת milestone עם blocked_by, שחרור חוסם, וידוא שמופיע ב-list_unblocked.
- **סנכרון API↔UI**: יצירת רשומה דרך API → רענון UI → רואים אותה (וגם הפוך).
- **שגיאות**: ניתוק רשת, 401 מהשרת → דף שגיאה תקין.

הרצה: `bunx playwright test`.

## 5. CI ותחזוקה

- `package.json` scripts: `test:unit`, `test:rls`, `test:api`, `test:e2e`, `test:all`.
- README קצר ב-`tests/README.md` עם איך להריץ + משתני סביבה נדרשים.
- דוח כיסוי (`vitest --coverage`) — יעד 80% לקבצי `lib/`.

## פרטים טכניים

- **תלויות חדשות**: `vitest` (אם לא מותקן), `@playwright/test`, `pg` (כבר קיים psql ב-shell — נשתמש ב-CLI במקום), `tsx` להרצת סקריפטים.
- **משתני סביבה לטסטים**: `CLAUDE_AGENT_TOKEN`, `IDAN_AGENT_TOKEN`, `TEST_USER_EMAIL`, `TEST_USER_PASSWORD`, `API_BASE_URL`.
- **בידוד**: כל טסט API/E2E יוצר רשומות עם prefix `__test__` ומנקה אחריו ב-`afterAll`.
- **לא נוגעים** ב-`src/integrations/supabase/*` (auto-generated) ולא ב-RLS הקיים אלא אם נמצא באג.

## תוצרים

1. ~6 קבצי טסט יחידה ב-`src/lib/**/__tests__/`.
2. `scripts/test-rls.ts`, `scripts/test-api.ts`.
3. `tests/e2e/*.spec.ts` עם 8-10 תרחישים.
4. `playwright.config.ts`, עדכון `package.json`.
5. דוח ממצאים: רשימת באגים שנמצאו (אם בכלל) עם תיקון מוצע לכל אחד — לא נתקן בלי אישור.

## שאלות לפני שמתחילים

- האם להריץ את בדיקות ה-API/E2E מול ה-Preview (`id-preview--...`) או מול הפרודקשן (`ops.pizantech.com`)?
- האם יש משתמש בדיקה ייעודי (email/password) שאפשר להשתמש בו ל-E2E, או שאצור אחד חדש?
- אם נמצא באג קריטי באמצע — לעצור ולשאול, או לתעד ולהמשיך?
