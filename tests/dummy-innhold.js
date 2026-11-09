'use strict';
/* Oppdiktet innhold til testene. Samme form som den private innholdsfilen: en funksjonskropp som returnerer { TEMPLATES, TRELLO, SITES, ANLEGG, LINKS }. */
const ok = (id, label, o = {}) => ({ id, type: 'ok', label, ...o });
const num = (id, label, unit) => ({ id, type: 'number', label, unit });
const TEMPLATES = [
  { id: 'uke_a', name: 'Ukentlig runde Testbygg A', site: 'Testbygg A', days: 7, tl: 'a', sections: [{ id: 'runde', title: 'Inspeksjon', items: [
    ok('lys', 'Lys er i orden'), ok('nodlys', 'Nødlys er i orden'), ok('dorer', 'Dører lukker'), num('trykk', 'Trykk', 'bar') ] }] },
  { id: 'mnd_a', name: 'Månedlig test Testbygg A', site: 'Testbygg A', months: 1, tl: 'a', sections: [{ id: 'test', title: 'Test', items: [ok('pumpe', 'Pumpe går'), ok('alarm', 'Alarm virker')] }] },
  { id: 'uke_b', name: 'Ukentlig runde Testbygg B', site: 'Testbygg B', days: 7, tl: 'b', sections: [{ id: 'runde', title: 'Inspeksjon', items: [ok('lys', 'Lys er i orden'), ok('nodlys', 'Nødlys er i orden')] }] },
  { id: 'avvik', name: 'Avviksmelding', site: '', hidden: true, sections: [{ id: 'avvik', title: 'Avvik', items: [{ id: 'feil', type: 'avvik', label: 'Beskriv avviket' }] }] },
];
const TRELLO = { done: 'x', board: 'y', lists: { a: 'la', b: 'lb' } };
const SITES = [
  { id: 'a', tl: 'a', name: 'Testbygg A', short: 'TA', tpls: ['uke_a', 'mnd_a'] },
  { id: 'b', tl: 'b', name: 'Testbygg B', short: 'TB', tpls: ['uke_b'] },
];
const cov = (t, k) => ({ t, k, x: [], alt: [] });
const ANLEGG = [
  { site: 'a', id: 'a_nodlys', name: 'Nødlys', note: '', cov: [cov('uke_a', ['runde.nodlys'])] },
  { site: 'a', id: 'a_pumpe', name: 'Pumpe', note: '', cov: [cov('mnd_a', ['test'])] },
  { site: 'b', id: 'b_nodlys', name: 'Nødlys', note: '', cov: [cov('uke_b', ['runde.nodlys'])] },
];
const LINKS = [{ id: 'l1', title: 'Testlenke', desc: '', url: 'https://example.org/', group: 'share' }];
return { TEMPLATES, TRELLO, SITES, ANLEGG, LINKS };
