// Render the merged UI without a browser or providers: live results must not turn into demo bookings.
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const source = `
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup as render } from 'react-dom/server';
import PlanPanel from './src/components/PlanPanel.jsx';
import Plan from './src/pages/Plan.jsx';
import { strings } from './src/i18n.js';
import { mockStory, storyFacts } from './src/agents/story.js';
const facts = storyFacts(mockStory());
const common = { t: strings.en, lang: 'en', triage: { level: 'yellow', headline: 'See a vet today', steps: ['Keep Mimi calm'], summary: 'Limping' }, facts, onCall() {}, vet: {prepared:true}, insurance: {prepared:true} };
const live = render(React.createElement(PlanPanel, common));
assert.match(live, /See a vet today/);
assert.match(live, /Prepare vet conversation/);
assert.doesNotMatch(live, /row-options|row-confirm|row-taxi/);
const rehearsal = render(React.createElement(PlanPanel, {...common, rehearsal:true}));
assert.match(rehearsal, /row-options/);
const plan = render(React.createElement(Plan, common));
assert.doesNotMatch(plan, /within 30 days|16:05 taxi|CHF 385/);
assert.match(plan, /policy/);
console.log('Merged UI: advice, live handoff, rehearsal gating and actual-policy checklist verified.');
`;
const result = await build({ stdin: { contents: source, resolveDir: root, loader: 'jsx' }, bundle: true, platform: 'node', format: 'cjs', write: false, jsx: 'automatic', external: ['node:assert/strict'], define: { 'process.env.NODE_ENV': '"production"', 'import.meta': '{}', 'import.meta.env': '{}', 'import.meta.url': JSON.stringify(import.meta.url) } });
const module = { exports: {} };
new Function('require', 'module', 'exports', result.outputFiles[0].text)(createRequire(import.meta.url), module, module.exports);
