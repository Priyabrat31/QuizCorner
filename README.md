# QuizCorner

> **Current project status (2 November 2026):** The connected Supabase project `QuizCorner` is already configured. `assets/js/config.js` contains its project URL and public publishable key. The five database tables, RLS protections, Realtime publication, and three Edge Functions (`submit-quiz`, `get-leaderboard`, `get-history`) are deployed. The owner has confirmed Anonymous Sign-Ins is enabled. **Do not create another Supabase project or rerun `schema.sql` / `policies.sql` on this existing project.** The next step is to upload this folder's contents to a GitHub repository and enable GitHub Pages. A real browser end-to-end quiz submission has not yet been verified.

QuizCorner is a mobile-first, static HTML/CSS/JavaScript quiz website designed for GitHub Pages with Supabase for anonymous browser identity, private answer-key evaluation, attempt history, best-score leaderboards and Realtime refresh events.

This repository contains the complete initial source structure. The seven creator profiles and quiz files are **editable placeholders**. All seven quiz files contain exactly 20 question slots and four options per question, but are intentionally unpublished until the owner replaces the sample text and adds the corresponding private answer keys in Supabase.

## Important before publishing

For the already-connected QuizCorner Supabase project, steps 1–4 below have been completed. Do not repeat them. Continue with:

1. Upload the **contents** of the extracted `QuizCorner` folder to the root of your GitHub repository (not just the ZIP file).
2. Enable GitHub Pages using branch `main` and folder `/ (root)`.
3. Replace the seven placeholder creator/quiz JSON files and image files when you have the real details.
4. Insert each quiz's real 20-answer key into `public.quiz_answer_keys`, then activate the matching quiz in `public.quizzes` and its creator entry in `data/creators.json`.
5. Test the published site over HTTPS before sharing it with students.

Do not publish real quizzes until the answer-key and database activation steps are complete.

---

## 1. Repository structure

```text
QuizCorner/
├── index.html
├── users.html
├── creator.html
├── quiz.html
├── results.html
├── leaderboard.html
├── history.html
├── offline.html
├── 404.html
├── assets/
│   ├── css/
│   │   ├── style.css
│   │   ├── responsive.css
│   │   ├── quiz.css
│   │   └── components.css
│   ├── js/
│   │   ├── config.js
│   │   ├── supabase.js
│   │   ├── common.js
│   │   ├── homepage.js
│   │   ├── creators.js
│   │   ├── creator.js
│   │   ├── quiz.js
│   │   ├── results.js
│   │   ├── leaderboard.js
│   │   └── history.js
│   ├── images/creators/
│   │   ├── creator-01.jpg ... creator-07.jpg
│   │   └── (replaceable placeholder avatars)
│   └── favicon/qc-icon.png
├── data/
│   ├── creators.json
│   └── creator-01.json ... creator-07.json
└── supabase/
    ├── config.toml
    ├── schema.sql
    ├── policies.sql
    └── functions/
        ├── submit-quiz/index.ts
        ├── get-leaderboard/index.ts
        └── get-history/index.ts
```

## 2. Create and configure Supabase

### Step 2.1 — Create a project (only for a brand-new installation)

**Skip this section for the existing QuizCorner project.** It is already created and connected. Only follow these instructions if you intentionally build a separate Supabase project from scratch.

1. Open [Supabase](https://supabase.com/) and create a new project.
2. Choose a project name and a strong database password. Keep the password private.
3. Wait for the project to finish provisioning.
4. Open **Project Settings → API Keys** (the dashboard wording can vary slightly).
5. Copy the **Project URL** and the public **Publishable key**. A legacy `anon` key can also be used if that is what your project displays.

### Step 2.2 — Add the public credentials to the website

The existing QuizCorner ZIP already has the correct project URL and public publishable key in `assets/js/config.js`. **Do not change these values unless intentionally connecting a different Supabase project.** For a new project, replace only these two values:

```js
SUPABASE_URL: 'https://YOUR_PROJECT_REF.supabase.co',
SUPABASE_PUBLIC_KEY: 'YOUR_SUPABASE_PUBLISHABLE_OR_ANON_KEY',
```

The public publishable/anon key is designed for browser use when Row Level Security is correctly enabled. **Never paste a `service_role` key or secret key into this file, any HTML file, or any public GitHub repository.**

The `BASE_PATH` setting can remain empty. The site detects its current directory automatically, so the links work on a GitHub Pages project path such as `https://username.github.io/QuizCorner/`. If you need to set it manually, use the exact repository path with both leading and trailing slash, for example `/QuizCorner/`.

### Step 2.3 — Enable Anonymous Sign-Ins

1. Open the Supabase project dashboard.
2. Open **Authentication → Sign In / Providers** (or the current Auth provider settings page).
3. Find the **Anonymous** provider/sign-in option.
4. Enable Anonymous Sign-Ins and save.

QuizCorner uses this silent browser session for private results history. It does not show students a login page. Supabase anonymous accounts cannot be recovered after a student clears browser storage or loses the browser session; that limitation is explained on the site and below.

### Step 2.4 — Create database tables and policies

For the current connected QuizCorner project, this step is already complete and has been verified. **Do not rerun these SQL files**: `schema.sql` creates the tables and initial records, while `policies.sql` defines client access restrictions and helper grants. Keep both files in GitHub as the source documentation for future maintenance. Only run them on a new, empty Supabase project.

The answer-key table and raw attempts table have Row Level Security enabled and no client policies. The browser cannot directly read those tables. Edge Functions use the server-side `service_role` key to evaluate quizzes and retrieve private history. The `leaderboard_best` table contains only public leaderboard fields and has a public read policy.

### Step 2.5 — Deploy Edge Functions

The three functions are already deployed and active in the connected QuizCorner project. **Skip deployment for the current installation.** The following instructions are retained only for redeploying changed function code or setting up another project.

**Option A — Supabase Dashboard editor (no CLI required).** This is the easier route when working from a phone or when you do not have a computer set up for development:

1. In the Supabase dashboard, open **Edge Functions** → **Deploy a new function** → **Via Editor**.
2. Create a function named `submit-quiz`. Replace the starter code with the complete contents of `supabase/functions/submit-quiz/index.ts`, then deploy it.
3. Repeat for `get-leaderboard` and `get-history`, using the matching `index.ts` file for each function.
4. In the function settings, keep JWT verification enabled for `submit-quiz` and `get-history`. Disable gateway JWT verification for `get-leaderboard`, because it is the public, read-only leaderboard endpoint. The function itself only returns the safe public leaderboard fields.
5. Check the function logs and built-in Test panel after deployment. Do not test `submit-quiz` with an invented answer key; activate a real quiz only after its questions and private answer key have been configured.

The Dashboard editor is convenient but does not provide version control or rollbacks for edits. Keep the original source in this GitHub repository and treat it as the source of truth. The deployed functions must be updated whenever you change their source files.

**Option B — Supabase CLI (recommended for repeatable, version-controlled deployments).** Use a computer with Node.js and the Supabase CLI installed.

Official guides:

- [Supabase CLI installation](https://supabase.com/docs/guides/local-development/cli/getting-started)
- [Deploy Edge Functions](https://supabase.com/docs/guides/functions/deploy)
- [Edge Function secrets](https://supabase.com/docs/guides/functions/secrets)

For Option B, from a terminal opened in the `QuizCorner` project folder:

```bash
supabase login
supabase link --project-ref YOUR_SUPABASE_PROJECT_REF
supabase functions deploy submit-quiz
supabase functions deploy get-leaderboard
supabase functions deploy get-history
```

Replace `YOUR_SUPABASE_PROJECT_REF` with the project reference shown in your Supabase project URL. If the CLI asks to link the project, use the same project reference.

Hosted Supabase Edge Functions receive the project URL and legacy `SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` environment values by default in projects where those legacy keys are enabled. The service-role value must remain server-side. Never add it to `assets/js/config.js` or commit it to GitHub. If your project uses only the newer secret/publishable key set and the legacy environment values are not present, configure the function environment in the Supabase dashboard using the current Supabase secrets instructions and update the server function setup accordingly. Do not create a custom secret whose name starts with `SUPABASE_`; that prefix is reserved by Supabase.

The `get-leaderboard` function is public because it returns public leaderboard data only. The `submit-quiz` and `get-history` functions require a valid authenticated anonymous browser session.

## 3. Add real creator details and questions

### 3.1 Edit creator information

Open `data/creators.json`. Each record has this structure:

```json
{
  "id": "creator-01",
  "name": "Creator's Full Name",
  "subject": "Biological Science",
  "topic": "Cell Biology",
  "image": "assets/images/creators/creator-01.jpg",
  "introduction": "A short introduction about this creator.",
  "quizFile": "data/creator-01.json",
  "quizEnabled": false
}
```

Change the name, subject, topic and introduction to the actual creator details. Replace the matching JPEG file in `assets/images/creators/`. Use a square image (recommended 600 × 600 px) and keep the same filename, or update the `image` path in the JSON.

The website reads creator names and details from `creators.json`, so no HTML or JavaScript edits are needed for ordinary creator-detail changes. Also update the matching row in `public.creators` and the quiz title in `public.quizzes` so the public leaderboard shows the current creator and quiz names.

### 3.2 Edit a quiz file

Open `data/creator-01.json`. Repeat for each creator file. A question must look like this:

```json
{
  "id": "q1",
  "question": "Which cell structure controls most cell activities?",
  "options": {
    "A": "Cell wall",
    "B": "Nucleus",
    "C": "Vacuole",
    "D": "Ribosome"
  }
}
```

Rules:

- Keep exactly 20 questions.
- Use unique IDs `q1` through `q20`.
- Every question must have exactly four options: `A`, `B`, `C`, `D`.
- Keep the answer key out of the public JSON file. Do not add `correctAnswer`, `answer`, `explanation`, or any private marking field.
- Set `durationMinutes` to the desired duration (1–180 minutes).
- After replacing all the placeholder question text and options, change `isPublished` to `true`.

The public JSON file is downloadable by anyone. Treat everything inside `data/` as public website content.

### 3.3 Add the private answer key in Supabase

The answer key is a JSON object mapping every question ID to its one correct option. It belongs in `public.quiz_answer_keys`, not in GitHub.

Example format (these letters are only an illustration; replace them with your actual verified answers):

```sql
insert into public.quiz_answer_keys (quiz_id, creator_id, answers)
values (
  'creator-01',
  'creator-01',
  '{"q1":"B","q2":"A","q3":"D","q4":"C","q5":"A","q6":"B","q7":"C","q8":"D","q9":"A","q10":"B","q11":"C","q12":"D","q13":"A","q14":"B","q15":"C","q16":"D","q17":"A","q18":"B","q19":"C","q20":"D"}'::jsonb
)
on conflict (quiz_id) do update
set creator_id = excluded.creator_id,
    answers = excluded.answers,
    updated_at = now();
```

After inserting the actual key, activate the matching quiz:

```sql
update public.quizzes
set title = 'Cell Biology Quiz',
    duration_minutes = 20,
    is_active = true,
    updated_at = now()
where id = 'creator-01';

update public.creators
set name = 'Creator Full Name',
    subject = 'Biological Science',
    topic = 'Cell Biology',
    updated_at = now()
where id = 'creator-01';
```

Finally, set `"quizEnabled": true` in the matching object in `data/creators.json`. A quiz is playable only when the public JSON flag, the database quiz status and the private answer key are all configured. This prevents a half-configured quiz from accepting attempts.

## 4. Add an eighth creator later

No new HTML page or JavaScript file is required.

1. Add a new record to `data/creators.json` with ID `creator-08`, a unique name, subject, topic, image path, introduction, quiz file path and `quizEnabled: false`.
2. Add `assets/images/creators/creator-08.jpg`.
3. Create `data/creator-08.json` by copying one existing 20-question template. Change `quizId` and `creatorId` to `creator-08`, add the real 20 questions, and leave the answer key out.
4. In Supabase SQL Editor, insert the creator and quiz rows:

```sql
insert into public.creators (id, name, subject, topic, is_active)
values ('creator-08', 'Creator Full Name', 'Subject', 'Quiz Topic', true);

insert into public.quizzes (id, creator_id, title, duration_minutes, question_count, is_active)
values ('creator-08', 'creator-08', 'Quiz Title', 20, 20, false);
```

5. Insert the actual private 20-answer key using the `quiz_answer_keys` example above, replacing every key and answer.
6. Set `public.quizzes.is_active = true` and `data/creators.json`'s `quizEnabled = true` only after checking all 20 question IDs and answers.
7. Commit/publish the changes to GitHub. The directory, selector and history tabs load creator entries dynamically from the JSON file.

## 5. Deploy the website on GitHub Pages

1. Create a GitHub repository named `QuizCorner` (or another name; keep the exact case of its Pages path).
2. Upload the contents of this folder to the repository root. Do not upload only the ZIP file; GitHub Pages needs `index.html`, `assets/`, `data/` and `supabase/` as actual files/folders.
3. In the repository, open **Settings → Pages**.
4. Under Build and deployment, select **Deploy from a branch**.
5. Select branch `main` and folder `/ (root)`, then save.
6. Wait for GitHub Pages to publish and open the displayed URL.
7. Confirm that the homepage loads, creator images and JSON load, and the links retain the repository path.

All site navigation is generated with the detected base path. CSS and script paths are relative from the root-level HTML pages.

## 6. Student identity and privacy behaviour

- Student name is used as the public leaderboard identity. It is normalised by Unicode NFKC, trimmed, repeated whitespace collapsed and lowercased.
- A normalised name is one leaderboard identity per quiz. Two different people using the same normalised name for the same quiz share the same best-score entry. This is a deliberate simplification, not identity verification.
- Each attempt is also associated with a Supabase anonymous user ID. The Results History page returns only rows belonging to that authenticated browser identity.
- Anonymous browser identities are not recoverable if the student signs out, clears browser data or uses another device. The student may lose access to their earlier history.
- Anonymous sign-ins do not prove who the student is. Public leaderboard names are user-entered and can be duplicated or impersonated.
- Completion time is measured in the browser and sent to the server. The server validates and clamps the submitted time to the quiz duration, but a determined user can tamper with the browser clock or request; it is not tamper-proof.
- The answer key is never downloaded to the browser before submission. The submit function returns the correct answers only after the answer submission has been accepted.
- QuizCorner does not include a student-facing history deletion button or an admin dashboard. The site owner remains responsible for responding to applicable privacy/data deletion requests. Use Supabase's authenticated-user and SQL administration tools to locate/delete a browser user's attempts, and separately remove the corresponding public leaderboard row when appropriate. Do not assume that hiding a delete button removes legal obligations.

## 7. Offline and browser limitations

- There is no service worker and this is not a PWA. A cold page visit cannot be guaranteed to load while offline.
- An already loaded quiz stores answers, question order, marked-for-review state, current question, and an absolute timer deadline in localStorage. The timer continues to elapse while the student is away.
- If a submission cannot reach Supabase, the browser keeps the submission pending and retries when online. The website does not show a successful result or leaderboard rank until Supabase confirms the submission.
- Browser `beforeunload` prompts are best-effort. Mobile browsers may close or suspend tabs without allowing the site to intercept the action.
- Use HTTPS (GitHub Pages provides HTTPS) so browser storage and authentication work as expected.

## 8. Security and maintenance checklist

- Never commit a Supabase service-role/secret key.
- Keep RLS enabled on all exposed tables.
- Do not add public policies to `quiz_answer_keys` or `quiz_attempts`.
- Do not store answer keys in `data/*.json`.
- Update the public creator JSON and the matching Supabase `creators` / `quizzes` rows when names or quiz titles change.
- Test submissions with a separate browser profile after each real quiz is published.
- Verify all 20 question IDs in public JSON match all 20 IDs in the private answer key.
- Review Supabase Auth abuse-prevention and rate-limit settings before sharing the site widely. Anonymous sign-in endpoints can be abused; enabling CAPTCHA/Turnstile may be appropriate for a public production launch. The current Edge Function code does not implement a custom per-user submission rate limiter.
- Keep the private Supabase project password and dashboard access secure.

## 9. Quick smoke test after deployment

Before sharing the site with students:

1. Open the site on a phone at 320–430 px widths and confirm no horizontal overflow.
2. Open all seven creator profiles.
3. Confirm all unpublished placeholder quizzes show **Quiz Coming Soon**.
4. Publish one test quiz only after entering its real question data, answer key and active status.
5. Attempt it in a clean browser profile, refresh mid-quiz, and confirm it resumes with the same question order and timer deadline.
6. Submit it and verify the server-calculated score and correct-answer review.
7. Confirm the result appears in that browser's Results History and in the correct public leaderboard.
8. Repeat an attempt with a lower score and confirm the public best score does not decrease. Repeat with the same score but faster time and confirm the faster time wins.
9. Open another browser profile and confirm the first profile's Results History is not visible.
10. Check Realtime leaderboard refresh and the manual Refresh button.

The source files and seven question JSON templates were structurally checked in the preparation environment. The connected Supabase project, five database tables, RLS settings, Realtime publication and three Edge Functions have been deployed and verified through the Supabase integration. The owner has confirmed Anonymous Sign-Ins is enabled. A complete student browser test and GitHub Pages deployment have **not** yet been performed. Real creator content and real private answer keys still need to be supplied before any quiz can be published.

---

## References

- [Supabase Anonymous Sign-Ins](https://supabase.com/docs/guides/auth/auth-anonymous)
- [Supabase Edge Functions deployment](https://supabase.com/docs/guides/functions/deploy)
- [Supabase Edge Function secrets](https://supabase.com/docs/guides/functions/secrets)
- [GitHub Pages documentation](https://docs.github.com/en/pages)
