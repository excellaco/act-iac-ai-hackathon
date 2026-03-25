# User Research — Homestretch Interview

**Organization:** Homestretch
**Context:** Non-profit working with the City of Falls Church on housing issues
**Date:** March 23, 2026
**Interviewee roles:**
- Elaine Wright — Director of Institutional Giving (Director of Development)
- Julie Crain — Community Outreach Coordinator
- Brenda Wilks — Deputy Director

---

## Key Findings

Homestretch is not a housing developer — the interviewees were clear about this distinction. Their work sits at the intersection of direct services, advocacy, and property ownership: they own an apartment building in Falls Church and engage with the city on affordable housing issues, but they do not build. Their clients need housing at roughly 30–35% Area Median Income (AMI), which they noted is substantially below what most "affordable housing" programs target (typically 80% AMI). This gap means they often have to educate city partners before they can even get to a policy conversation.

Permitting time came up unprompted as a major cost driver. Elaine cited a developer panelist at a Fairfax housing symposium who said the window from land purchase to completed permitting can run five to seven years — and that carrying cost is embedded in final unit prices. This framing came from the private development side, not from Homestretch's own operations, but it landed as credible and relevant to the group.

The City of Falls Church is not in Parcella yet, and it was the first specific ask. Brenda noted there are active plans to build affordable housing in the city and flagged that Falls Church's small scale (2.2 square miles) makes jurisdiction-level data especially meaningful. The group also confirmed that zoning exceptions are common in Falls Church — Julie noted that the building on their current site is already seeking variances for both height and reduced parking.

---

## Reactions to Parcella

The overall reaction was positive, with appropriate caveats about fit. Brenda and Elaine were candid that building and developing is not Homestretch's lane, but they saw the data as relevant to conversations they do have — with city officials, with potential partners, and internally when making property decisions. Elaine's framing was that when the city asks why more affordable housing isn't being built, having concrete, accessible data to cite would change those conversations.

The what-if simulation was the standout feature. Elaine called it out specifically as what makes the tool usable rather than just informative. Julie extended this: she pointed to the parking what-if as directly applicable to exception requests, noting that developers in Falls Church are already making the cost-impact argument to justify reduced parking. The simulation gives non-experts a way to make the same argument with data behind it.

The chat feature was noted favorably — Brenda specifically said that having concise, accurate information available through a conversational interface would be helpful — though the team acknowledged it wasn't fully functional during the demo.

The main gap raised was community sentiment. Brenda suggested the tool could incorporate some signal about whether a given community is receptive to affordable housing development in their area. This is ambitious, but it surfaced organically as something that shapes whether projects survive the public process.

Falls Church data was the most direct ask. The team had no interest in navigating a national map to find it — they wanted to search for their city and have it be there.

---

## Implications for the Val Persona

This interview confirms the secondary audience dimensions of the Val persona rather than the primary one. Homestretch is not Val — they lack a dedicated housing policy analyst and don't have the GIS fluency or regulatory depth Val brings. But they are exactly the kind of organization that would receive Val's outputs, attend the public hearings she prepares for, and use the same data to have conversations with elected officials.

The interview adds nuance to the "descriptive, not prescriptive" design principle. Val needs the tool to be neutral because she sometimes defends Fairfax's different approach to zoning reform. Homestretch needs it to be neutral for a different reason: they occupy multiple roles simultaneously — tenant advocates, property owners, city partners — and the data has to be usable regardless of which hat they're wearing in a given conversation.

The affordability definition gap is worth flagging even though it's not a Val persona issue. Val works within official AMI definitions; Homestretch's clients exist well below that floor. Parcella doesn't need to solve this, but the team should be aware that some users will see the "affordable housing" framing and immediately note that it doesn't reach their population.

---

## Implications for Design

**Parcella as a data-backed argument tool, not just an analysis tool.** Homestretch's role is often to educate decision-makers — city officials, board members, the public — before a policy conversation can even start. Parcella fits into that workflow as a source of supporting data for claims and hypotheses they're already making, not a tool for original research. This framing is consistent with Val's use case but extends it to non-expert advocates.

**Add small municipalities.** Falls Church was the first ask. The current focus on large counties (Arlington, Fairfax, Loudoun) leaves out the smaller jurisdictions where affordable housing conversations are just as active and where exceptions and variances are already in play. Expanding coverage to cities like Falls Church should be on the post-hackathon roadmap.

**Prioritize parcel-level data.** Homestretch's direct experience as a property manager in Falls Church — and their firsthand knowledge of recent development projects, including projects that received zoning exceptions — confirmed the need for more granular map views. A backlog item has been added to provide a more detailed map view of zoning, links to zoning ordinances, and links to the Zoning Atlas so users can explore smaller parcels within a jurisdiction.

**Make permitting time more visible.** Elaine's point about 5–7 year permitting windows as a cost driver suggests the permitting complexity sub-score deserves more prominent treatment, or at least a plain-language callout that connects permitting delay to construction cost in the UI. This is one of the few regulatory factors that non-experts understood immediately and found credible.

**Track exceptions as a future data layer.** Homestretch's awareness of local projects that received zoning exceptions — height variances, reduced parking — points to a meaningful future enhancement: tracking data on projects that received exceptions, quantifying their development impact, and surfacing that data to help jurisdictions evaluate whether changing zoning policy could shorten permit approval timelines and reduce costs.

**Position the what-if simulator for exception-seeking, not just policy analysis.** Julie's observation was concrete: developers in Falls Church are already using cost-impact arguments to request height and parking variances. The simulator can serve this use case directly, and the UI should make it easy to produce a what-if output that reads as a supporting exhibit for a variance request — not just a policy planning exercise.

**Consider municipalities as a user type, not just a subject.** Julie suggested cities could use Parcella to self-assess their housing-friendliness. This is a meaningful framing shift. A municipality staff member using the tool to understand their own regulatory position is a different persona than Val, and the tool's neutral, data-first framing supports it well.

**Flag community sentiment as a future layer.** Brenda's suggestion that the tool incorporate some signal about community receptivity to development is ambitious and probably out of scope for the current build, but it reflects a real variable that shapes whether projects survive the public process. Worth noting for a future research spike.

**Accessibility for non-expert users is confirmed.** This interview validated that plain-language outputs matter. The Homestretch team did not need Parcella to produce a briefing — they needed it to give them one number they could quote in a meeting. That use case maps closely to Val's, even if the context is different.

---

## Quotes

**On wanting Falls Church data (Brenda Wilks):**
> "Are you able to pull up City of Falls Church? There's some plans to build affordable housing here in the city. Since the city is so small, it'd be interesting to see that."

**On the what-if simulation (Elaine Wright):**
> "I love the what-if simulation. I think that really helps it become a more usable product."

**On community sentiment as a factor (Brenda Wilks):**
> "Community feedback becomes a big deal and some projects survive it and others don't... Maybe if there were a way to have this tool get a sense of what the community in that particular area — are they looking forward to something like this, building affordable housing or whatever it may be?"
