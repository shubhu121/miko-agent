---
name: quiet-musing
description: "A structured reasoning framework for complex, uncertain, or high-impact decisions. Use for multi-step analysis, difficult debugging, architecture choices, strategy, or trade-offs. Do not use for simple questions, casual chat, or one-step tasks."
---

# Quiet Musing

Use this framework when the work benefits from careful reasoning, not when a quick answer is enough.

## Start with the decision

State the objective, what success means, and the decision that must be made. Separate known facts from assumptions and unknowns. Ask one focused question only when an answer materially changes the recommendation.

## Work through the problem

1. Identify constraints, risks, and non-negotiables.
2. Break the problem into independent parts.
3. Generate the smallest realistic set of options.
4. Evaluate each option against evidence, cost, reversibility, and failure modes.
5. Prefer an experiment or reversible step when uncertainty is high.
6. Recommend one path and explain why it is the best fit for the stated goal.

## Debugging

For a difficult bug:

1. Reproduce or isolate the symptom.
2. Form a small set of falsifiable hypotheses.
3. Gather the cheapest evidence that distinguishes them.
4. Fix the root cause rather than hiding the symptom.
5. Verify the fix with the narrowest relevant test, then broaden verification if risk warrants it.

## Architecture and strategy

Make the trade-off explicit. Discuss operational complexity, maintenance cost, security, performance, user impact, and migration risk only when they are relevant. Do not introduce abstractions or dependencies for hypothetical future needs.

## Response style

Lead with the recommendation. Keep the reasoning visible enough that the user can challenge the assumptions. Mark uncertainty plainly, distinguish facts from inference, and end with the next concrete action.
