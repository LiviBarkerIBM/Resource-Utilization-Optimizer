# Resource Utilization Optimizer
AI-assisted staffing recommendation platform designed to optimize consultant allocation, reduce bench time, and improve project staffing decisions.
Live Demo: https://livibarkeribm.github.io/Resource-Utilization-Optimizer/
## Overview
The Resource Utilization Optimizer helps workforce management teams and project managers match available consultants to open project roles using AI-assisted recommendations and weighted scoring logic.
The application evaluates consultant skills, availability, band alignment, certifications, location, and project requirements to generate ranked candidate recommendations with match explanations and risk indicators.
## Business Objective
The platform is designed to:
- Match available consultants (supply) to project staffing demands
- Reduce consultant bench time
- Improve staffing efficiency and decision quality
- Generate ranked staffing recommendations
- Provide visibility into staffing risks and skill gaps
## Key Features
### Candidate Matching Engine
- Weighted scoring model for candidate recommendations
- Skills-based matching
- JRS alignment analysis
- Availability matching
- Band fit evaluation
- Availability matching
- Location and travel consideration
- Certification validation
- Nice-to-have skill matching
### Match Scoring
Each consultant receives:
- Overall Match Score (0–100)
- Ranked recommendation position
- Breakdown by matching category
### AI Recommendation Summary
Automatically generates recommendation narratives such as:
> “This candidate is a strong fit due to 90% skills alignment, matching band level, availability before project start date, and proximity to the client location.”
### Risk & Gap Analysis
Flags:
- Missing certifications
- Missing required skills
- Outdated or missing CVs
- Availability conflicts
- Location concerns
- Band mismatches
### Search & Filtering
Users can filter candidates by:
- Skills
- Certifications
- Band level
- Location
- Availability
- JRS
- Match score
- Travel readiness
### Dashboards
#### Demand Dashboard
Displays:
- Open project roles
- Staffing status
- Start dates
- Number of candidate matches
#### Candidate Dashboard
Displays:
- Ranked recommendations
- Match score breakdown
- Availability details
- Recommendation summaries
- Risk indicators
---
## Data Inputs
### Consultant Data
The platform supports ingestion of:
- Employee Name
- Employee ID / Talent ID
- Band Level
- JRS (Job Role Structure)
- Certifications
- CV/Resume
- Availability Date
- Location
- Travel Willingness
- Assignment Status
- Bench Status
### Project Demand Data
The platform supports ingestion of:
- Project Name
- Client Name
- Role Title
- Seat ID / Talent Request ID
- Required Band
- Role JRS
- Required Skills
- Nice-to-Have Skills
- Certifications
- Start Date
- Weekly Hours
- Location Requirements
- Travel Requirements
- Contract Status
---
## Match Scoring Dimensions
The recommendation engine evaluates candidates across multiple weighted criteria:
| Category | Description |
|---|---|
| Skills Match | Alignment between required and consultant skills |
| JRS Match | Alignment between role and consultant JRS |
| Band Fit | Band compatibility and flexibility |
| Availability Fit | Timing alignment with project start |
| Location Fit | Geographic and travel compatibility |
| Certification Match | Required certification alignment |
| Nice-to-Have Skills | Bonus skill alignment |
The final score combines all dimensions into an overall recommendation score from 0–100.
---
## MVP Scope
The Minimum Viable Product (MVP) includes:
- Consultant and project role data ingestion
- Matching and scoring engine
- Ranked candidate recommendations
- AI-generated recommendation summaries
- Risk and gap analysis
- Search and filtering
- Workforce staffing dashboards
