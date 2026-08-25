# Resource Utilization Optimizer
AI-assisted staffing recommendation platform designed to optimize consultant allocation, reduce bench time, and improve project staffing decisions.

Live Demo: https://livibarkeribm.github.io/Resource-Utilization-Optimizer/

---

## Overview
The Resource Utilization Optimizer helps workforce management teams and project managers match available consultants to open project roles using AI-assisted recommendations and weighted scoring logic.

The application evaluates consultant skills, availability, band alignment, certifications, location, industry experience, and project requirements to generate ranked candidate recommendations with match explanations and risk indicators.

---

## Business Objective
The platform is designed to:
- Match available consultants (supply) to project staffing demands
- Reduce consultant bench time
- Improve staffing efficiency and decision quality
- Generate ranked staffing recommendations
- Provide visibility into staffing risks and skill gaps
- Support data-driven resource planning across departments and managers

---

## Key Features

### Candidate Matching Engine
- Weighted scoring model for candidate recommendations
- Skills-based matching (required + nice-to-have)
- JRS alignment analysis
- Band fit evaluation
- Availability matching
- Location and travel consideration
- Certification validation
- **Industry experience matching** — scans CV industries against project industry requirements

### Match Scoring
Each consultant receives:
- Overall Match Score (0–100)
- Ranked recommendation position
- Breakdown by matching category (7 dimensions)

### AI Recommendation Summary
Automatically generates recommendation narratives including industry fit context, e.g.:
> "Arjun Mehta is a strong candidate for this role due to strong skills alignment (4/4 required skills matched), band level within the specified range, availability aligns with role start, proven Financial Services industry experience."

### Risk & Gap Analysis
Flags:
- Missing certifications
- Missing required skills
- Outdated or missing CVs
- Availability conflicts
- Location concerns
- Band mismatches
- **Industry experience gaps**

### Search & Filtering

#### Demand Dashboard Filters (Sidebar)
Users can filter open roles by:
- **Dept** — department owning the role
- **Manager** — hiring manager
- **Band** — required band range
- **Project** — specific project name
- **Quarter** — project start quarter (e.g. Q3 2026, Q4 2026)
- JRS
- Min Match Score
- Travel requirement
- Industry

#### Candidate Dashboard Filters
Users can filter ranked candidates by:
- Min Match Score
- Band
- Availability (within 30 / 60 days of role start)
- Travel willingness
- **Associate Availability by Date** — from/to date range picker

### Dashboards

#### Demand Dashboard
Displays:
- Open project roles with dept, manager, and quarter metadata
- Project date range (start → end)
- Staffing status and contract state
- Top match score per role
- Number of candidates scoring ≥ 50

#### Candidate Dashboard
Displays:
- Ranked recommendations with match score
- 7-dimension score breakdown (Skills, JRS, Band, Availability, Location, Certifications, Industry Fit)
- Industry experience chips from CV (★ required, ✦ nice-to-have)
- Availability details
- AI-generated recommendation narrative
- Risk & gap indicators

---

## Data Inputs

### Consultant Data
| Field | Required | Notes |
|---|---|---|
| name | ✅ | Full name |
| band | ✅ | e.g. 6, 7, 8, 9 |
| jrs | ✅ | Job Role Structure title |
| availabilityDate | ✅ | YYYY-MM-DD |
| location | ✅ | City, ST format |
| skills | ✅ | Comma-separated list |
| id | optional | Auto-generated if blank |
| dept | optional | Department name |
| manager | optional | Manager name |
| certifications | optional | Comma-separated |
| industries | optional | CV-scanned industry experience, comma-separated |
| travelWillingness | optional | true/false or yes/no |
| assignmentStatus | optional | Bench / Active / Project Ending |
| benchStatus | optional | true/false |
| cvExists | optional | true/false |
| cvRecencyMonths | optional | Number of months since CV was updated |

### Project Demand Data
| Field | Required | Notes |
|---|---|---|
| roleTitle | ✅ | |
| client | ✅ | |
| projectName | ✅ | |
| jrs | ✅ | |
| bandMin | ✅ | |
| bandMax | ✅ | |
| requiredSkills | ✅ | Comma-separated |
| startDate | ✅ | YYYY-MM-DD |
| location | ✅ | |
| id | optional | Auto-generated if blank |
| seatId | optional | Talent Request ID |
| dept | optional | |
| manager | optional | |
| quarter | optional | e.g. Q3 2026 |
| niceToHaveSkills | optional | Comma-separated |
| certifications | optional | Comma-separated |
| requiredIndustry | optional | Primary industry requirement |
| niceToHaveIndustries | optional | Comma-separated |
| endDate | optional | YYYY-MM-DD |
| weeklyHours | optional | Defaults to 40 |
| travelRequired | optional | true/false |
| contractSigned | optional | true/false |
| status | optional | Defaults to Open |

---

## Match Scoring Dimensions

The recommendation engine evaluates candidates across 7 weighted criteria:

| Category | Weight | Description |
|---|---|---|
| Skills Match | 32% | Alignment between required and consultant skills; penalises outdated/missing CVs |
| Band Fit | 18% | Band compatibility and flexibility (exact range = 100, adjacent = 70–75) |
| Availability Fit | 16% | Timing alignment with project start date |
| Industry Fit | 10% | CV industry experience vs. required project industry |
| Location Fit | 9% | Geographic and travel compatibility |
| JRS Match | 9% | Job Role Structure alignment (exact or partial keyword overlap) |
| Certification Match | 6% | Required certification alignment |

The final score combines all dimensions into an overall recommendation score from 0–100.

### Industry Fit Scoring
| Score | Meaning |
|---|---|
| 90–100 | Has required industry experience on CV |
| 55–75 | Adjacent / nice-to-have industry experience |
| 20 | No relevant industry experience |

---

## Source Data Upload

Users can replace the built-in sample data with their own files at any time.

### How to Upload
1. Click **Upload Data** in the top nav or sidebar
2. Select the **Consultant Roster** tab and/or **Project Demand** tab
3. Drop or browse to an `.xlsx` or `.csv` file — first row must be column headers
4. The app validates required columns and shows a row count preview
5. Click **Apply Data** — scoring re-runs immediately with the new data

### Persistence
- Uploaded data is saved to **localStorage** and survives page refreshes
- The top nav badge changes from **"Sample Data"** to **"Uploaded Data"** (green)
- Click **Reset to Sample Data** in the sidebar to clear and restore built-in data

### Template Files
Use the **Export to Excel** feature to download pre-formatted templates:
- **Consultant Roster** sheet → fill and re-upload as your consultant file
- **Demand Summary** sheet → fill and re-upload as your roles file

---

## Excel Report Export

Two export options are available from the top nav and within each view.

### Export All (Full Workbook)
Triggered from the top nav or the **Export All** button on the Demand Dashboard.

Produces a 3-sheet `.xlsx` file named `Resource_Utilization_Report_YYYY-MM-DD.xlsx`:

| Sheet | Contents |
|---|---|
| Demand Summary | All open roles with dept, manager, quarter, date range, top match score, candidate count |
| Candidate Matches | Every consultant scored against every role — all 7 dimension scores, missing skills/certs, risk summary, AI narrative |
| Consultant Roster | Full consultant profiles including industries from CV, CV status, dept, manager |

### Export This Role
Triggered from the **Candidate Dashboard** for the currently selected role.

Produces a 2-sheet `.xlsx` file named `{ProjectName}_Candidates_YYYY-MM-DD.xlsx`:

| Sheet | Contents |
|---|---|
| Role Summary | Full role metadata |
| Ranked Candidates | All consultants ranked by score with dimension breakdown, risks, and AI narrative |

---

## Technical Notes
- **No build step required** — single `index.html` file, runs directly in any modern browser
- **SheetJS (xlsx 0.20.3)** loaded from CDN — powers both Excel export and file upload parsing
- **localStorage** used for data persistence across sessions
- All scoring logic is in `src/engine/scorer.js` (modular reference) and inlined in `index.html`
- Sample data lives in `src/data/consultants.js` and `src/data/roles.js`

---

## MVP Scope — Delivered
- ✅ Consultant and project role data ingestion (upload + sample)
- ✅ 7-dimension matching and scoring engine including industry fit
- ✅ Ranked candidate recommendations
- ✅ AI-generated recommendation summaries
- ✅ Risk and gap analysis (skills, certs, CV, availability, location, band, industry)
- ✅ Search and filtering (dept, manager, band, project, quarter, JRS, score, travel, industry, availability date range)
- ✅ Workforce staffing dashboards (Demand + Candidate)
- ✅ Excel report export (full workbook + per-role)
- ✅ Source data upload (.xlsx / .csv) with localStorage persistence
