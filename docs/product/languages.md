# Languages

## Supported Language Foundation

```
uk    — Ukrainian
ru    — Russian
en    — English
es    — Spanish
fr    — French
de    — German
ar    — Arabic
```

## Rules

- User-facing product should support these languages over time.
- AI Analyst must respect the selected output language.
- Hardcoded user-facing strings should be avoided when localization layer is introduced.
- Arabic requires RTL support before production localization.
- Default: `auto` (detect from context/notes input).

## Output Language Flow

```
User selects language → stored in decision.output_language
→ AI Analyst generates reasoning in that language
→ Factors, reasoning, disclaimer all in selected language
```
