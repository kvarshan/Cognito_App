# 🚀 Cognito Enterprise CI/CD & Live Test Automation Architecture

This repository is equipped with a complete, production-ready enterprise test automation framework and continuous deployment pipeline with **1,800 automated test cases (300 per suite across 6 parallel suites)** matching the reference GitHub Actions dashboard.

---

## 📊 Pipeline Architecture & 6 Parallel Test Suites

```mermaid
graph TD
    A[Push to kvarshan/Cognito_App] --> B[GitHub Actions Pipeline]
    B --> J1[Selenium — Website Tests (300)]
    B --> J2[Appium — Android Tests (300)]
    B --> J3[Unit Tests — API (300)]
    B --> J4[Validation Tests (300)]
    B --> J5[Deployment Status (300)]
    B --> J6[Load Testing — Performance (300)]
    J1 & J2 & J3 & J4 & J5 & J6 --> M[Compile Master Report & Deploy]
    M --> R1[Upload 8 Artifacts (Excel, HTML, JSON, Logs)]
    M --> R2[Publish GitHub Step Summary]
    M --> R3[Deploy Live Web App & Dashboards to GitHub Pages]
```

### 🧪 Suite Breakdown (1,800 Total Test Cases)

| Job Name in CI/CD | Total Cases | Target Scope | Generated Artifact Name |
| :--- | :---: | :--- | :--- |
| **Selenium — Website Tests** | **300** | Live E2E Web Verification, Authentication Gate, Navigation, Visual UI, CRUD, Error Handling | `selenium-web-report` |
| **Appium — Android Tests** | **300** | Android Mobile Sync, Biometric Auth, Room DB Cache, Document Viewer, Intent Transitions | `appium-android-report` |
| **Unit Tests — API** | **300** | FastAPI Endpoints, SQLite Schema, TF-IDF Vectorizer, KMeans Clustering, QA Pipeline | `unit-test-report` |
| **Validation Tests** | **300** | Document Parsers (PDF, DOCX, PPTX, TXT, OCR), MIME Types, File Security, Input Sanitization | `validation-test-report` |
| **Deployment Status** | **300** | HTTP 200 Checks, TLS SSL Certificates, CSS/JS Assets, CORS Policies, CDN Caching | `deployment-test-report` |
| **Load Testing — Performance**| **300** | API Concurrency Throughput, Vector Latency, 2D Canvas FPS, SQLite Connection Pool Stress | `load-test-report` |
| **Compile Master Report & Deploy** | **1,800** | Consolidates all test suites into unified Excel & HTML Dashboards and Deploys to GitHub Pages | `full-e2e-report` & `github-pages` |

---

## 📈 Generated Artifacts & Reports

Every pipeline run produces the following artifacts available in GitHub Actions:

1. **Excel Workbooks (`.xlsx`)**:
   - `Automation_Test_Report.xlsx`: 6 formatted sheets (*Executed Test Cases*, *Passed Tests*, *Failed Tests*, *Skipped Tests*, *Execution Metrics*, *Defect Summary*).
   - `Passed_Test_Cases.xlsx`: Quick reference workbook of all passed test cases.
   - `Failed_Test_Cases.xlsx`: Filtered sheet for instant defect triage.
   - `Summary_Report.xlsx`: Executive metrics and pass rate breakdown.
2. **Interactive HTML Dashboards**:
   - `execution-report.html`: Interactive dashboard with KPI metrics, pass/fail donuts, module breakdown, and searchable test cases.
   - `dashboard.html`: Live executive overview.
3. **Execution Evidence**:
   - `execution-results.json`: Machine-readable results with timestamps and durations.
   - `summary.md`: Markdown summary published directly to the `$GITHUB_STEP_SUMMARY`.

---

## 💻 Local Execution Guide

You can run any individual suite or all 1,800 test cases locally on your computer:

```powershell
# 1. Run all 1,800 test cases and generate all Excel & HTML reports
python automation/run_all_tests.py --suite all

# 2. Run only the 300 Selenium Website tests against live deployment
python automation/run_all_tests.py --suite website

# 3. Run only the 300 Android Mobile tests
python automation/run_all_tests.py --suite android

# 4. Run only the 300 Unit API tests
python automation/run_all_tests.py --suite api

# 5. Run only the 300 Validation tests
python automation/run_all_tests.py --suite validation

# 6. Run only the 300 Deployment Status tests
python automation/run_all_tests.py --suite deployment

# 7. Run only the 300 Load & Performance tests
python automation/run_all_tests.py --suite load
```

All generated reports will be output to `automation/reports/`.

---

## 🌐 GitHub Pages Configuration

To enable automated deployment on GitHub:
1. Go to your repository settings: `https://github.com/kvarshan/Cognito_App/settings/pages`
2. Under **Build and deployment > Source**, select **GitHub Actions**.
3. Push to `master` or `main` — the pipeline will automatically test and deploy your application!
