import { useEffect, useState } from 'react';
import { api } from '../../api.js';
import { useToast } from '../../context.jsx';
import { Card, Confirm, Empty, ErrorBox, Modal, PageHeader, Segmented, Spinner } from '../../components/ui.jsx';
import { IconDown, IconEdit, IconEye, IconEyeOff, IconPlus, IconTrash, IconUp } from '../../components/icons.jsx';
import { loadSite, Markdown } from '../public/site.jsx';

const TABS = [
  { value: 'home', label: 'Home page' },
  { value: 'pages', label: 'Menu & pages' },
  { value: 'wins', label: 'Student wins' },
  { value: 'faq', label: 'FAQ' },
  { value: 'practice', label: 'Practice tests' },
];

/** Teacher: edit the public website without code. Every change is live right after “Save”. */
export default function Website() {
  const [tab, setTab] = useState(() => sessionStorage.getItem('web_tab') || 'home');
  const [d, setD] = useState(null);
  const [err, setErr] = useState(null);
  const load = () => api.get('/site/admin').then((x) => { setD(x); loadSite(true).catch(() => {}); }).catch(setErr);
  useEffect(() => { load(); }, []);
  useEffect(() => { try { sessionStorage.setItem('web_tab', tab); } catch {} }, [tab]);

  if (err) return <ErrorBox error={err} onRetry={load} />;
  if (!d) return <Spinner />;
  const st = d.stats;
  return (
    <div className="stack">
      <PageHeader title="Website" sub="What visitors see before they sign in: home page, menu pages, student wins, FAQ and free practice tests.">
        <a className="btn ghost" href="/site" target="_blank" rel="noreferrer"><IconEye /> Open the website</a>
      </PageHeader>
      <div className="grid g4 keep2">
        <Stat n={st.finished} l="practice tests finished" />
        <Stat n={st.week} l="tests started this week" />
        <Stat n={st.guests} l="taken by guests (no account)" />
        <Stat n={st.avg_pct == null ? '—' : `${st.avg_pct}%`} l="average score" />
      </div>
      <Segmented value={tab} onChange={setTab} options={TABS} />
      {tab === 'home' && <HomeEditor block={d.blocks.home} reload={load} />}
      {tab === 'pages' && <PagesEditor pages={d.pages} sections={d.blocks.sections} reload={load} />}
      {tab === 'wins' && <ListEditor k="testimonials" items={d.blocks.testimonials} reload={load} empty={{ name: '', from: '', to: '', text: '' }}
        fields={[['name', 'Student name'], ['from', 'Score before (e.g. 1180)'], ['to', 'Score after (e.g. 1420)'], ['text', 'What they say', true]]} title={(x) => `${x.name || 'New'}${x.to ? ` · ${x.from} → ${x.to}` : ''}`} />}
      {tab === 'faq' && <ListEditor k="faq" items={d.blocks.faq} reload={load} empty={{ q: '', a: '' }} fields={[['q', 'Question'], ['a', 'Answer', true]]} title={(x) => x.q || 'New question'} />}
      {tab === 'practice' && <PracticeEditor block={d.blocks.practice} bank={st.bank} reload={load} />}
    </div>
  );
}

const Stat = ({ n, l }) => <Card className="web-stat"><b>{n}</b><span className="muted">{l}</span></Card>;

function useSave(k, reload) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const save = async (data, msg = 'Saved — the website is updated') => {
    setBusy(true);
    try { await api.put(`/site/blocks/${k}`, { data }); toast(msg); await reload(); return true; }
    catch (e) { toast(e.message, 'bad'); return false; } finally { setBusy(false); }
  };
  return [save, busy];
}

/* ---------- home page texts ---------- */
function HomeEditor({ block, reload }) {
  const [h, setH] = useState(block);
  const [save, busy] = useSave('home', reload);
  const [reset, setReset] = useState(false);
  const toast = useToast();
  const set = (k) => (e) => setH({ ...h, [k]: e.target.value });
  const setArr = (k, i, f) => (e) => setH({ ...h, [k]: h[k].map((x, j) => (j === i ? { ...x, [f]: e.target.value } : x)) });
  return (
    <div className="stack">
      <Card className="stack">
        <h2>Top of the page</h2>
        <div className="grid g2">
          <label className="field"><span>Title</span><input value={h.hero_title} onChange={set('hero_title')} /><small className="muted">“SAT” is added in front automatically</small></label>
          <label className="field"><span>Highlighted words (yellow)</span><input value={h.hero_accent} onChange={set('hero_accent')} /></label>
        </div>
        <label className="field"><span>Text under the title</span><textarea rows={3} value={h.hero_sub} onChange={set('hero_sub')} /></label>
        <div className="grid g3">
          <label className="field"><span>Main button</span><input value={h.cta_primary} onChange={set('cta_primary')} /></label>
          <label className="field"><span>Second link</span><input value={h.cta_secondary} onChange={set('cta_secondary')} /></label>
          <label className="field"><span>Small note</span><input value={h.cta_note} onChange={set('cta_note')} /></label>
        </div>
        <label className="field"><span>Tags around the title (comma separated)</span><input value={(h.badges || []).join(', ')} onChange={(e) => setH({ ...h, badges: e.target.value.split(',').map((x) => x.trim()).filter(Boolean) })} /></label>
        <h3>Big numbers</h3>
        <div className="grid g3">
          {(h.stats || []).map((s, i) => (
            <div key={i} className="stack sm web-mini">
              <input value={s.value} onChange={setArr('stats', i, 'value')} aria-label={`Number ${i + 1}`} />
              <input value={s.label} onChange={setArr('stats', i, 'label')} aria-label={`Label ${i + 1}`} />
            </div>
          ))}
        </div>
      </Card>
      <Card className="stack">
        <h2>3 steps</h2>
        <div className="grid g3">
          {(h.steps || []).map((s, i) => (
            <div key={i} className="stack sm web-mini">
              <small className="muted">Step {i + 1}</small>
              <input value={s.title} onChange={setArr('steps', i, 'title')} aria-label={`Step ${i + 1} title`} />
              <textarea rows={3} value={s.text} onChange={setArr('steps', i, 'text')} aria-label={`Step ${i + 1} text`} />
            </div>
          ))}
        </div>
      </Card>
      <Card className="stack">
        <div className="row between"><h2>Features</h2><button className="btn soft sm" onClick={() => setH({ ...h, features: [...(h.features || []), { emoji: '⭐', title: '', text: '' }] })}><IconPlus /> Add</button></div>
        <div className="grid g3">
          {(h.features || []).map((f, i) => (
            <div key={i} className="stack sm web-mini">
              <div className="row" style={{ gap: 8 }}>
                <input style={{ width: 56 }} value={f.emoji} onChange={setArr('features', i, 'emoji')} aria-label="Emoji" />
                <input className="grow" value={f.title} onChange={setArr('features', i, 'title')} placeholder="Title" />
                <button className="icon-btn" onClick={() => setH({ ...h, features: h.features.filter((_, j) => j !== i) })} aria-label="Remove"><IconTrash /></button>
              </div>
              <textarea rows={2} value={f.text} onChange={setArr('features', i, 'text')} placeholder="Short text" />
            </div>
          ))}
        </div>
      </Card>
      <Card className="stack">
        <h2>Bottom call to action</h2>
        <div className="grid g2">
          <label className="field"><span>Title</span><input value={h.final_title} onChange={set('final_title')} /></label>
          <label className="field"><span>Text</span><input value={h.final_sub} onChange={set('final_sub')} /></label>
        </div>
      </Card>
      <div className="web-savebar">
        <button className="btn ghost" onClick={() => setReset(true)}>Restore default texts</button>
        <button className="btn primary lg" disabled={busy} onClick={() => save(h)}>{busy ? 'Saving…' : 'Save home page'}</button>
      </div>
      {reset && <Confirm title="Restore default texts?" text="Your home page texts will be replaced with the original ones." confirmLabel="Restore" onClose={() => setReset(false)}
        onConfirm={async () => { try { const r = await api.post('/site/blocks/home/reset'); setH(r.data); toast('Restored'); await reload(); } catch (e) { toast(e.message, 'bad'); } setReset(false); }} />}
    </div>
  );
}

/* ---------- menu sections + pages ---------- */
function PagesEditor({ pages, sections, reload }) {
  const toast = useToast();
  const [secs, setSecs] = useState(sections);
  const [ns, setNs] = useState('');
  const [edit, setEdit] = useState(null);
  const [del, setDel] = useState(null);
  const [saveSecs, busy] = useSave('sections', reload);
  const newId = (label) => label.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || `s${Date.now()}`;
  const move = (i, dir) => { const a = [...secs]; const j = i + dir; if (j < 0 || j >= a.length) return; [a[i], a[j]] = [a[j], a[i]]; setSecs(a); };
  const remove = async (p) => { try { await api.del(`/site/pages/${p.id}`); toast('Page deleted'); await reload(); } catch (e) { toast(e.message, 'bad'); } };
  const togglePub = async (p) => { try { await api.put(`/site/pages/${p.id}`, { ...p, published: !p.published }); await reload(); } catch (e) { toast(e.message, 'bad'); } };

  return (
    <div className="stack">
      <Card className="stack">
        <div className="row between wrap">
          <div><h2>Menu sections</h2><p className="muted">They appear in the top menu next to “Practice Tests”. Turn one off to hide it.</p></div>
          <form className="row" style={{ gap: 8 }} onSubmit={(e) => { e.preventDefault(); if (!ns.trim()) return; setSecs([...secs, { id: newId(ns), label: ns.trim(), enabled: true }]); setNs(''); }}>
            <input value={ns} onChange={(e) => setNs(e.target.value)} placeholder="New section, e.g. News" aria-label="New section name" />
            <button className="btn soft sm" disabled={!ns.trim()}><IconPlus /> Add section</button>
          </form>
        </div>
        <div className="web-secs">
          {secs.map((s, i) => (
            <div key={s.id} className={`web-sec ${s.enabled ? '' : 'off'}`}>
              <input value={s.label} onChange={(e) => setSecs(secs.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} aria-label="Section name" />
              <span className="muted">{pages.filter((p) => p.section === s.id).length} pages</span>
              <button className="icon-btn" onClick={() => move(i, -1)} aria-label="Move up"><IconUp /></button>
              <button className="icon-btn" onClick={() => move(i, 1)} aria-label="Move down"><IconDown /></button>
              <button className={`btn sm ${s.enabled ? 'soft' : 'ghost'}`} onClick={() => setSecs(secs.map((x, j) => (j === i ? { ...x, enabled: !x.enabled } : x)))}>{s.enabled ? 'Shown' : 'Hidden'}</button>
              <button className="icon-btn" aria-label="Remove section" onClick={() => setSecs(secs.filter((_, j) => j !== i))}><IconTrash /></button>
            </div>
          ))}
        </div>
        <div className="row" style={{ justifyContent: 'flex-end' }}><button className="btn primary" disabled={busy} onClick={() => saveSecs(secs.filter((s) => s.label.trim()))}>{busy ? 'Saving…' : 'Save menu'}</button></div>
      </Card>

      <Card className="stack">
        <div className="row between wrap">
          <div><h2>Pages</h2><p className="muted">Guides, course descriptions, news… Each page gets its own link and appears in its menu section.</p></div>
          <button className="btn primary" onClick={() => setEdit({ section: secs[0]?.id || 'guides', title: '', summary: '', body: '', emoji: '📘', video_url: '', published: true, position: pages.length })}><IconPlus /> New page</button>
        </div>
        {!pages.length ? <Empty title="No pages yet" text="Create the first one — for example a guide about the SAT format." /> : (
          <div className="web-pages">
            {pages.map((p) => (
              <div key={p.id} className={`web-page ${p.published ? '' : 'off'}`}>
                <span className="em">{p.emoji || '📘'}</span>
                <div className="grow"><b>{p.title}</b><small className="muted">{secs.find((s) => s.id === p.section)?.label || p.section} · /p/{p.slug}{p.published ? '' : ' · draft'}</small></div>
                <a className="icon-btn" href={`/p/${p.slug}`} target="_blank" rel="noreferrer" aria-label="Open"><IconEye /></a>
                <button className="icon-btn" onClick={() => togglePub(p)} aria-label={p.published ? 'Hide' : 'Publish'} title={p.published ? 'Hide (make a draft)' : 'Publish'}>{p.published ? <IconEyeOff /> : <IconEye />}</button>
                <button className="icon-btn" onClick={() => setEdit(p)} aria-label="Edit"><IconEdit /></button>
                <button className="icon-btn" onClick={() => setDel(p)} aria-label="Delete"><IconTrash /></button>
              </div>
            ))}
          </div>
        )}
      </Card>
      {edit && <PageForm page={edit} sections={secs} onClose={() => setEdit(null)} reload={reload} />}
      {del && <Confirm title={`Delete “${del.title}”?`} text="The page and its link will be removed." onClose={() => setDel(null)} onConfirm={() => { remove(del); setDel(null); }} />}
    </div>
  );
}

function PageForm({ page, sections, onClose, reload }) {
  const toast = useToast();
  const [p, setP] = useState(page);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(false);
  const set = (k) => (e) => setP({ ...p, [k]: e.target.value });
  const save = async () => {
    setBusy(true);
    try {
      if (p.id) await api.put(`/site/pages/${p.id}`, p); else await api.post('/site/pages', p);
      toast(p.id ? 'Page saved' : 'Page created'); await reload(); onClose();
    } catch (e) { toast(e.message, 'bad'); } finally { setBusy(false); }
  };
  return (
    <Modal title={p.id ? 'Edit page' : 'New page'} onClose={onClose} wide
      footer={<><label className="row" style={{ gap: 8, marginRight: 'auto' }}><input type="checkbox" checked={p.published} onChange={(e) => setP({ ...p, published: e.target.checked })} /> Published</label>
        <button className="btn ghost" onClick={onClose}>Cancel</button><button className="btn primary" disabled={busy || !p.title.trim()} onClick={save}>{busy ? 'Saving…' : 'Save page'}</button></>}>
      <div className="stack">
        <div className="grid g3">
          <label className="field"><span>Section</span><select value={p.section} onChange={set('section')}>{sections.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</select></label>
          <label className="field"><span>Emoji</span><input value={p.emoji} onChange={set('emoji')} /></label>
          <label className="field"><span>Order</span><input type="number" value={p.position} onChange={set('position')} /></label>
        </div>
        <label className="field"><span>Title</span><input autoFocus value={p.title} onChange={set('title')} placeholder="e.g. How the Digital SAT is scored" /></label>
        <label className="field"><span>Short description (shown on cards)</span><input value={p.summary} onChange={set('summary')} /></label>
        <label className="field"><span>Video link (YouTube, optional)</span><input value={p.video_url} onChange={set('video_url')} placeholder="https://youtu.be/…" /></label>
        <div className="row between"><b>Text</b><button className="btn ghost sm" onClick={() => setPreview(!preview)}>{preview ? 'Edit' : 'Preview'}</button></div>
        {preview ? <div className="web-preview"><Markdown text={p.body} /></div> : (
          <label className="field"><textarea rows={12} value={p.body} onChange={set('body')} placeholder={'## Heading\n\nA paragraph with **bold** and *italic*.\n\n- list item\n- list item'} />
            <small className="muted">## heading · **bold** · *italic* · “- ” for a list · empty line = new paragraph</small></label>
        )}
      </div>
    </Modal>
  );
}

/* ---------- simple lists: student wins, FAQ ---------- */
function ListEditor({ k, items, reload, empty, fields, title }) {
  const [list, setList] = useState(items);
  const [save, busy] = useSave(k, reload);
  const [open, setOpen] = useState(-1);
  const upd = (i, f, v) => setList(list.map((x, j) => (j === i ? { ...x, [f]: v } : x)));
  const move = (i, dir) => { const a = [...list]; const j = i + dir; if (j < 0 || j >= a.length) return; [a[i], a[j]] = [a[j], a[i]]; setList(a); };
  return (
    <Card className="stack">
      <div className="row between"><p className="muted">Shown on the home page in this order.</p><button className="btn soft sm" onClick={() => { setList([...list, { ...empty }]); setOpen(list.length); }}><IconPlus /> Add</button></div>
      {!list.length && <Empty title="Nothing yet" text="Press “Add”." />}
      {list.map((x, i) => (
        <div key={i} className="web-item">
          <div className="row" style={{ gap: 8 }}>
            <button className="linkish grow" style={{ textAlign: 'left' }} onClick={() => setOpen(open === i ? -1 : i)}><b>{title(x)}</b></button>
            <button className="icon-btn" onClick={() => move(i, -1)} aria-label="Up"><IconUp /></button>
            <button className="icon-btn" onClick={() => move(i, 1)} aria-label="Down"><IconDown /></button>
            <button className="icon-btn" onClick={() => setList(list.filter((_, j) => j !== i))} aria-label="Remove"><IconTrash /></button>
          </div>
          {open === i && (
            <div className="grid g2" style={{ marginTop: 10 }}>
              {fields.map(([f, label, long]) => (
                <label key={f} className="field" style={long ? { gridColumn: '1 / -1' } : undefined}><span>{label}</span>
                  {long ? <textarea rows={3} value={x[f] || ''} onChange={(e) => upd(i, f, e.target.value)} /> : <input value={x[f] || ''} onChange={(e) => upd(i, f, e.target.value)} />}</label>
              ))}
            </div>
          )}
        </div>
      ))}
      <div className="row" style={{ justifyContent: 'flex-end' }}><button className="btn primary" disabled={busy} onClick={() => save(list)}>{busy ? 'Saving…' : 'Save'}</button></div>
    </Card>
  );
}

/* ---------- practice tests ---------- */
function PracticeEditor({ block, bank, reload }) {
  const [p, setP] = useState(block);
  const [save, busy] = useSave('practice', reload);
  const set = (k) => (e) => setP({ ...p, [k]: e.target.value });
  const visible = Math.ceil((bank * (Number(p.pool_percent) || 40)) / 100);
  return (
    <Card className="stack">
      <div>
        <h2>Free practice tests</h2>
        <p className="muted">Anyone can take them without signing up. Questions come from the Question Bank ({bank} active) — the bank itself is not changed. Each visit shows a new random part of it, so students keep coming back for fresh questions.</p>
      </div>
      <div className="grid g3">
        <label className="field"><span>Visible part of the bank per visit (%)</span><input type="number" min={10} max={100} value={p.pool_percent} onChange={set('pool_percent')} /><small className="muted">≈ {visible} questions per visit</small></label>
        <label className="field"><span>Questions per test</span><input type="number" min={5} max={60} value={p.test_size} onChange={set('test_size')} /><small className="muted">Real SAT module: 27</small></label>
        <label className="field"><span>Minutes per test</span><input type="number" min={5} max={120} value={p.minutes} onChange={set('minutes')} /><small className="muted">Real SAT module: 32</small></label>
      </div>
      <p className="muted">Hidden questions (Question Bank → eye icon) never appear in practice tests.</p>
      <div className="row" style={{ justifyContent: 'flex-end' }}><button className="btn primary" disabled={busy} onClick={() => save(p)}>{busy ? 'Saving…' : 'Save'}</button></div>
    </Card>
  );
}
