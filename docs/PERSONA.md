# Parcela — User Persona

## Valentina Reyes
### Housing Policy Analyst, Fairfax County Department of Planning & Development
**Goes by Val**

---

## Profile

Valentina (Val) is a mid-career housing policy analyst at a large suburban county planning department. She has a master's degree in urban planning and has spent six years working on zoning policy, housing affordability studies, and land use regulations. She is technically comfortable — confident in Excel, GIS tools, and data dashboards — but is not a software engineer.

Her day-to-day work involves researching housing policy options, preparing briefings for elected officials, and analyzing the regulatory environment to support grant applications and policy proposals. She regularly needs to make the case for zoning reform to colleagues, department leadership, and county supervisors who may be skeptical or politically cautious.

---

## Goals

Val's primary goal when using Parcela is to **build a defensible, data-backed case for regulatory change** that she can present to decision-makers without it being dismissed as opinion or advocacy.

Specifically she wants to:

- Understand how Fairfax County's zoning regulations compare to neighboring jurisdictions like Arlington and Loudoun
- Quantify the development cost impact of specific regulations, particularly parking minimums and density limits
- Model what would happen to housing feasibility if specific regulations were changed
- Produce outputs she can include in briefings, grant applications, and policy memos

---

## Frustrations

**Data is scattered and hard to compare.** Zoning codes live in PDFs on county websites, each formatted differently. Pulling comparable data across jurisdictions requires hours of manual research, and even then the numbers are hard to put side by side.

**It's hard to make the regulatory impact concrete.** Val knows intuitively that parking minimums drive up construction costs, but translating that into a specific dollar figure she can defend to a skeptical supervisor is difficult without access to proprietary cost modeling tools.

**Political context makes precision important.** Any number she puts in front of elected officials will be scrutinized. She can't afford to present a score or estimate that she can't explain or that turns out to be wrong. She needs to know not just what the data says but how confident to be in it.

**Tools built for developers, not planners.** Most feasibility and market analysis tools are designed for private developers evaluating investment opportunities. The framing, the outputs, and the assumptions don't translate well to public sector policy work.

---

## What Success Looks Like

Val opens Parcela before a departmental meeting on parking reform. She searches for Fairfax County, reviews the RIS score, and sees that parking minimums are the single largest contributor to the Development Cost Impact sub-score. She adds Arlington and Loudoun for comparison and sees that Fairfax is significantly more restrictive on parking than both. She runs a what-if simulation reducing parking minimums from 2 spaces/unit to 1 space/unit and sees the estimated cost per unit drop by $18,000 and the RIS score fall from 74 to 61.

She exports nothing — taking a screenshot, noting the data sources cited on the panel, and walking into the meeting with a clear, specific, defensible number. When someone asks "where does that figure come from?" she can point to the HUD FMR data and RSMeans cost index cited in the score panel and explain exactly how the estimate was derived.

---

## Relationship to the Product

| Dimension | Detail |
|-----------|--------|
| Entry point | Searches directly for her county — does not browse a national map |
| Primary screen | Score panel with sub-score accordions |
| Most-used feature | What-if simulation — this is where the policy value is |
| Trust signals | Confidence badges, data source attribution, "About this score" modal |
| Sharing behavior | Screenshots and copy-paste into Word/PowerPoint for briefings |
| Biggest concern | Being caught presenting a number she can't defend |
| Device | Desktop browser, county-issued Windows laptop |

---

## Quotes

> "I can tell parking minimums are the problem. I just need a number I can put in a slide."

> "If I can't explain where the score comes from, I can't use it."

> "I don't need it to tell me what to do. I need it to show me what the data says."

---

## Implications for Design

- **Search-first entry:** Val knows her jurisdiction. She should never have to navigate a national map to find Fairfax County.
- **Confidence transparency is non-negotiable:** Every figure she might cite needs a clear confidence indicator and source attribution. Low-confidence extractions should be visibly flagged, not hidden.
- **Descriptive, not prescriptive:** The RIS must never appear to recommend a policy direction. Val works in a politically sensitive environment and needs a tool that measures without advocating.
- **What-if is the core value:** The comparison view gets her attention; the what-if simulation is what makes the tool useful in a meeting. This feature should be fast, intuitive, and produce outputs she can quote verbally.
- **No jargon she didn't bring:** Terms like DCI, DCOI, and CRP should be explained in plain language in the UI. Val knows planning terminology but not the internal scoring framework.
