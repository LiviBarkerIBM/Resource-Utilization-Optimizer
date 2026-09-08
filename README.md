# Resource Utilization Optimizer

A browser-based staffing and utilization decision-support tool that ranks consultants against open project roles, tracks workforce capacity, highlights staffing risks, and recommends rebalancing actions.

**Live demo:** https://livibarkeribm.github.io/Resource-Utilization-Optimizer/

## Overview

The Resource Utilization Optimizer brings project demand, consultant profiles, candidate matching, and utilization monitoring into one interface. It can run with built-in sample data or data uploaded from Excel/CSV files.

The application provides three connected views:

1. **Demand Dashboard** — summarizes open roles and their strongest candidate matches.
2. **Candidate Dashboard** — ranks every consultant for a selected role and explains each recommendation.
3. **Utilization Dashboard** — calculates workload, free capacity, utilization status, open-role demand, and rebalancing opportunities for the same consultant roster used by role matching.

All matching and utilization calculations run locally in the browser. Uploaded data is stored in browser `localStorage` until it is reset.

## Core Capabilities

### Demand Dashboard

- Displays open roles with client, project, department, manager, quarter, JRS, band range, dates, location, and contract state.
- Shows the top consultant match score for each role.
- Counts candidates with an overall match score of at least 50.
- Provides summary cards for open roles, available consultants, average top-match score, and signed contracts.
- Opens a detailed ranked-candidate view when a role is selected.
- Searches roles by client, role title, JRS, or project name.
- Filters roles by department, manager, band, project, quarter, and industry.

### Candidate Dashboard

For a selected open role, the application:

- Scores and ranks every consultant.
- Displays the overall match score and rank.
- Shows consultant assignment state and CV status.
- Shows synchronized utilization status and percentage.
- Shows exact allocated hours, weekly capacity, and free hours.
- Displays a seven-dimension score breakdown.
- Highlights required and nice-to-have skill coverage.
- Identifies required and adjacent industry experience.
- Generates a recommendation narrative summarizing strengths and gaps.
- Flags staffing risks such as missing skills, missing certifications, stale CVs, availability conflicts, location conflicts, band mismatches, and industry gaps.
- Filters candidates by minimum score, band, availability window, travel willingness, and availability date range.
- Exports the selected role and its ranked candidates to Excel.

### Utilization Dashboard

The Utilization Dashboard uses the same consultant records shown on open-role candidate cards, keeping role matching and capacity information fully synchronized.

It provides:

- Average utilization across the current filtered consultant set.
- Counts of overallocated, underutilized, and bench consultants.
- Exact allocated hours, weekly capacity, and free hours.
- Current project allocations and allocation date ranges.
- Utilization bars and status badges.
- Consultant name search with partial, case-insensitive matching.
- Department and utilization-status filters that dynamically reflect the loaded consultant data.
- Filtered summary cards, consultant table, and rebalancing recommendations.
- Expandable consultant rows showing full allocation details and a list of all open roles where that consultant is a ranked candidate.
- An **Open Role Matches** column showing which open roles list the consultant as a top-ranked or high-scoring candidate — each chip is clickable and navigates to that role's candidate panel.
- A sidebar alert count for all overallocated and bench consultants.

#### Cross-dashboard navigation

- From the **Candidate Dashboard**, each candidate card has a **📊 Utilization** button that switches to the Utilization Dashboard, pre-filters the name search to that consultant, and scrolls their row into view.
- From the **Utilization Dashboard**, clicking an open-role chip in the **Open Role Matches** column navigates directly to that role's ranked candidate list.
- Expanding a consultant's row in the Utilization Dashboard shows the full list of open roles they are matched to, with rank, score, and a **View →** button for each.

#### Utilization statuses

| Status | Rule |
|---|---|
| On Bench | 0% utilization |
| Underutilized | 1–69% utilization |
| Fully Utilized | 70–100% utilization |
| Overallocated | More than 100% utilization |

#### Utilization data precedence

Utilization is calculated in this order:

1. If `currentAllocations` contains assignments, allocated hours are summed and divided by `weeklyCapacity`.
2. If no detailed allocations exist, `utilizationPercentage` is used.
3. If neither is supplied, `assignmentStatus` provides a fallback: `Active` = 100%, `Project Ending` = 50%, and other values = 0%.

`weeklyCapacity` defaults to 40 hours when omitted.

### Rebalancing Recommendations

The utilization engine generates actions for:

- **Overallocated consultants** — reports excess hours and suggests reviewing or rolling off an allocation.
- **Bench consultants** — recommends the consultant's strongest open-role match when the score is viable.
- **Underutilized consultants** — identifies open roles that may fit the consultant's available capacity and have a match score of at least 50.

Recommendations update with utilization dashboard filters.

## Candidate Match Scoring

Each consultant is evaluated against each role across seven weighted dimensions:

| Dimension | Weight | Evaluation |
|---|---:|---|
| Skills | 32% | Required-skill coverage, nice-to-have bonus, and CV recency penalty |
| Band | 18% | Fit within or near the requested band range |
| Availability | 16% | Alignment between consultant availability and role start date |
| Industry | 10% | Required and nice-to-have industry experience |
| Location | 9% | Geographic alignment and travel compatibility |
| JRS | 9% | Exact or partial Job Role Structure alignment |
| Certifications | 6% | Required certification coverage |

The weighted result is rounded to an overall score from 0 to 100 and used to rank candidates.

### Industry scoring

| Score | Meaning |
|---:|---|
| 90–100 | Required industry experience is present; nice-to-have industries may add a bonus |
| 55–75 | Adjacent or nice-to-have industry experience is present |
| 20 | No relevant industry experience is listed |
| 100 | The role has no industry requirement |

### Risk and gap analysis

The candidate view can flag:

- Missing required skills
- Missing required certifications
- Missing CV
- CV older than 12 months
- Availability misalignment
- Location or travel conflict
- Band mismatch
- Required industry experience gap

## Data Upload and Column Mapping

Users can replace either or both built-in datasets with `.xlsx` or `.csv` files.

### Upload workflow

1. Select **Upload Data** from the top navigation or sidebar.
2. Choose **Consultant Roster** or **Project Demand**.
3. Browse for a file or drag it into the upload area.
4. If headers already match the expected field keys, the file is parsed directly.
5. Otherwise, the Column Mapping Agent proposes mappings using field names, labels, aliases, and token similarity.
6. Review low-confidence or unresolved mappings and map every required field.
7. Select **Apply Data** to replace the corresponding in-memory dataset and rerun the dashboards.

The app shows whether it is using **Sample Data** or **Uploaded Data**. Uploaded data persists across refreshes. **Reset to Sample Data** clears the saved browser data and reloads the built-in records.

> Data is processed in the browser and stored in that browser's local storage. Do not upload sensitive production data unless its use is approved for the environment where the app is hosted.

## Consultant Roster Schema

The first worksheet is read from Excel workbooks. The first row must contain headers. List fields use comma-separated values unless noted otherwise.

| Field | Required | Format / behavior |
|---|:---:|---|
| `name` | Yes | Consultant's full name |
| `band` | Yes | Numeric band, such as 6–9 |
| `jrs` | Yes | Job Role Structure title |
| `availabilityDate` | Yes | Date, preferably `YYYY-MM-DD` |
| `location` | Yes | Location such as `Austin, TX` |
| `skills` | Yes | Comma-separated list |
| `id` | No | Auto-generated when blank |
| `dept` | No | Department or practice |
| `manager` | No | Manager name |
| `certifications` | No | Comma-separated list |
| `industries` | No | Comma-separated industry experience |
| `travelWillingness` | No | Boolean-like value: true/false, yes/no, 1/0 |
| `assignmentStatus` | No | Common values: `Bench`, `Active`, `Project Ending`; defaults to `Bench` |
| `utilizationPercentage` | No | Number such as `75` or text such as `75%` |
| `benchStatus` | No | Boolean-like value; inferred from assignment status when omitted |
| `cvExists` | No | Boolean-like value; defaults to true when omitted |
| `cvRecencyMonths` | No | Months since the CV was updated |
| `weeklyCapacity` | No | Weekly capacity in hours; defaults to 40 |
| `currentAllocations` | No | JSON array of allocation objects |

Example `currentAllocations` cell:

```json
[{"projectName":"Cloud Migration","client":"Example Client","weeklyHours":24,"startDate":"2026-01-15","endDate":"2026-06-30"}]
```

When detailed allocations are supplied, their hours take precedence over `utilizationPercentage`.

## Project Demand Schema

| Field | Required | Format / behavior |
|---|:---:|---|
| `roleTitle` | Yes | Open-role title |
| `client` | Yes | Client name |
| `projectName` | Yes | Project or program name |
| `jrs` | Yes | Required Job Role Structure |
| `bandMin` | Yes | Minimum band |
| `bandMax` | Yes | Maximum band |
| `requiredSkills` | Yes | Comma-separated list |
| `startDate` | Yes | Date, preferably `YYYY-MM-DD` |
| `location` | Yes | Role location |
| `id` | No | Auto-generated when blank |
| `seatId` | No | Requisition or talent request ID; auto-generated when blank |
| `dept` | No | Department or practice |
| `manager` | No | Hiring or delivery manager |
| `quarter` | No | Planning quarter, such as `Q3 2026` |
| `niceToHaveSkills` | No | Comma-separated list |
| `certifications` | No | Comma-separated required certifications |
| `requiredIndustry` | No | Primary required industry |
| `niceToHaveIndustries` | No | Comma-separated adjacent industries |
| `endDate` | No | Role end date |
| `weeklyHours` | No | Required weekly hours; defaults to 40 |
| `travelRequired` | No | Boolean-like value |
| `contractSigned` | No | Boolean-like value |
| `status` | No | Defaults to `Open` |

## Excel Exports

SheetJS powers workbook import and export.

### Full report

**Export to Excel** or **Export All** creates `Resource_Utilization_Report_YYYY-MM-DD.xlsx` with:

| Sheet | Contents |
|---|---|
| Demand Summary | Role requirements, dates, status, top candidate, top score, and number of candidates scoring at least 50 |
| Candidate Matches | Every consultant-role score, dimension details, utilization percentage, risks, and recommendation narrative |
| Consultant Roster | Consultant profile, assignment state, utilization percentage, skills, certifications, industries, and CV status |

### Selected role report

**Export This Role** creates `{ProjectName}_Candidates_YYYY-MM-DD.xlsx` with:

| Sheet | Contents |
|---|---|
| Role Summary | Requirements and metadata for the selected role |
| Ranked Candidates | Ranked consultants, utilization percentage, score dimensions, risks, and recommendation narrative |

Exported **Consultant Roster** and **Demand Summary** sheets can be used as starting templates for future uploads. Because export labels are human-readable, the Column Mapping Agent may open when those sheets are re-uploaded; review and confirm its proposed mappings.

## Running the Application

No package installation or build step is required.

1. Clone or download the repository.
2. Open `index.html` in a modern browser, or serve the repository from a local static web server.
3. Use the built-in sample data or upload consultant and project-demand files.

An internet connection is required to load SheetJS from its HTTPS CDN for Excel/CSV import and Excel export.

## Sample Data Files

The repository includes two ready-to-use CSV files for testing the upload workflow:

| File | Contents |
|---|---|
| `sample_consultants.csv` | 12 consultants across all three departments with varied utilization: bench, underutilized, fully utilized, and overallocated |
| `sample_project_demand.csv` | 10 open roles across new clients and projects not present in the built-in sample data |

Both files use the exact internal field keys as column headers, so they upload without triggering the Column Mapping Agent. See the schema sections below for a description of every supported field.

## Project Structure

```text
.
├── index.html                    # Complete browser UI and active application logic
├── README.md                     # Project documentation
├── sample_consultants.csv        # Sample consultant upload file
├── sample_project_demand.csv     # Sample project demand upload file
├── src/
│   ├── data/
│   │   ├── consultants.js        # Reference sample consultant data
│   │   └── roles.js              # Reference sample role data
│   └── engine/
│       └── scorer.js             # Reference modular scoring engine
└── test.py                       # Repository test script
```

The running application is implemented in `index.html`. Files under `src/` provide modular reference data and scoring code but are not imported by the page.

## Technology and Storage

- HTML, CSS, and JavaScript in a single browser page
- SheetJS `xlsx` 0.20.3 loaded over HTTPS for spreadsheet parsing and generation
- Browser `localStorage` keys `ruo_consultants` and `ruo_roles` for uploaded data persistence
- No backend service or database
- No user authentication or multi-user synchronization
