# Rebrand: PTOPS → Tovanto

## Context

חיפוש בקוד לא מצא אזכורים של "CaterFlow". המותג הנוכחי הוא **PTOPS / PizanTech Ops / Pizan Ops Hub**. אטפל בו כמותג המקור להחלפה. שם החברה־האם **PizanTech** יישאר בתגית ה-tagline בלבד, כפי שהוגדר.

המיפוי:
- `PTOPS` → `Tovanto`
- `PizanTech Ops` / `PizanTech Operations` → `Tovanto`
- `Pizan Ops Hub` → `Tovanto`
- `PizanTech` (לבדו, כמיתוג מוצר) → `Tovanto`, אבל נשמר בתוך ה-tagline כ"מבית PizanTech"

קבצים, רכיבים, מודולים, וטבלאות בשם `ptops-*` — **לא משתנים** (פנימי).

## Files to edit (visible strings only)

### 1. `src/routes/__root.tsx` (שורות 57–62)
- `title` / `og:title` / `twitter:title`: `"Tovanto"`
- `description` / `og:description` / `twitter:description`: `"Tovanto — מערכת ההפעלה לקייטרינג ואירועים, מבית PizanTech"`
- (לא נוגע ב-og:image, og:type, וכו')

### 2. `src/components/app-shell.tsx` (שורות 103–104)
- Wordmark `PTOPS` → `Tovanto`
- שורת תת-כותרת `PizanTech · v0.1` → `PizanTech · v0.1` (נשאר — מציין את החברה־האם, לא את המוצר). 
  - **דגל לאישור:** האם להשאיר את התת-כותרת כפי שהיא, או לשנותה ל-`Tovanto · v0.1`? ברירת המחדל שלי: להשאיר כפי שהיא, כי זה המקום היחיד שבו "מבית PizanTech" מופיע בצ'יפ ה-header.

### 3. `src/routes/login.tsx` (שורות 55–56)
- `PTOPS` → `Tovanto`
- `PizanTech Operations` → `מערכת ההפעלה לקייטרינג ואירועים`
  - **דגל לאישור:** הטקסט המקורי באנגלית; האם להחליף לעברית (כפי שה-tagline מציין) או להשאיר באנגלית כ-`Catering & Events OS`? ברירת המחדל שלי: עברית, תואם להעדפות שפה.

### 4. (אופציונלי) `tests/README.md` ו-`./README.md`
- אם מופיעים שמות מותג, אעדכן. אם רק פנימי (כמו `ptops-logic`) — לא אגע.

## What stays untouched

- כל קובץ/מודול/import/symbol בשם `ptops-*`, `ptops-logic`, `ptops-ui`, `ptops-types`, וכו'.
- שם package (`tanstack_start_ts`), `playwright.config.ts` (פנימי).
- סכמת DB, RLS, edge functions, secrets, routes, env vars.
- `og:image` URL (לא ביקשת תמונה חדשה).
- `<html lang="en">` נשאר (לא ביקשת לשנות).

## Items I want you to confirm

1. **App-shell sub-chip**: להשאיר `PizanTech · v0.1` או להחליף ל-`Tovanto · v0.1`?
2. **Login subtitle**: עברית (`מערכת ההפעלה לקייטרינג ואירועים`) או אנגלית (`Catering & Events OS`)?
3. **קייטרינג & אירועים?** המוצר בפועל מציג Dashboard/Tasks/CRM/Dev — לא תכונות קייטרינג. ה-tagline הקנוני שסיפקת מדבר על "מערכת ההפעלה לקייטרינג ואירועים". לאשר שזה אכן ה-positioning הרצוי גם אם ה-UI הנוכחי גנרי.

לאחר אישור — אבצע את ההחלפה ב-3 הקבצים ואחזיר ר