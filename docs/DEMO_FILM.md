# Pawse: two-minute English demo

The 120-second edit uses an English interface, concise English narration and English translations of the German speech. The supplied product recording plays at approximately 1.13× speed with pitch preserved.

| Time | Content |
|---|---|
| 00:00–00:06 | Cat intro: Zurich, a worried owner, and a language barrier |
| 00:06–01:34 | Product recording: Gemini conversation, care guidance, nearby clinics, German vet and insurer scripts |
| 01:34–01:44 | Multi-agent pipeline: voice, vision, policy retrieval, orchestration, care, discovery and communication |
| 01:44–01:54 | Rehearsal overview: clinic CHF 385 versus home CHF 510, calendar, taxi and claim checklist |
| 01:54–02:00 | “Nine lives. One app. Less paperwork. More cuddles.” |

German speech is a feature demonstration; the surrounding explanation is English. The recording demonstrates generated speech, not real telephone connections. Recipient replies, appointments, taxi bookings and illustrative insurance outcomes remain visibly simulated. The source recording uses a standard German voice; it is not evidence of owner-voice cloning. Approved personal voices can be selected separately in the app.

## Integration verification

The integration combines current main, the device-location and pet-vision work, and the complete Mimi story branch. Camera capture retains a preview and explicit Send action; Upload remains separate. Experimental facial cues and the inline nearby-vet/German-message handoff are retained. Main's vision model default and deployment workflow are retained.

The English browser rehearsal was walked through intake, clinics, vet, insurer, option selection, vet confirmation, cat-friendly taxi and the final case summary. It displayed CHF 385 / CHF 510 and 16:05 taxi → 16:30 vet, with simulation labels. This verifies the scripted UI path, not live external bookings or insurance approval.

Local checks after the final main sync: 205 tests passed, 8 skipped; the production build passed. Film assets and private recordings are delivered locally and excluded from Git.
