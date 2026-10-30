import { z } from 'zod';

export const devopsLookupSchema = z.strictObject({ url: z.string().url().max(2048) });
const segment = /^[a-zA-Z0-9][a-zA-Z0-9 ._%()-]{0,199}$/;

/** Only Azure DevOps work-item URLs; never a caller-supplied fetch destination. */
export function parseWorkItemUrl(input) {
  let url;
  try { url = new URL(input); } catch { throw Object.assign(new Error('Enter a valid Azure DevOps work-item URL.'), { status: 400 }); }
  const legacy = url.hostname.match(/^([a-z0-9-]+)\.visualstudio\.com$/i);
  if (url.protocol !== 'https:' || url.username || url.password || url.port || (url.hostname !== 'dev.azure.com' && !legacy)) throw Object.assign(new Error('Only HTTPS dev.azure.com or organisation.visualstudio.com work-item links are supported.'), { status: 400 });
  if (url.search || url.hash) throw Object.assign(new Error('Use a direct work-item URL without query parameters or fragments.'), { status: 400 });
  let parts;
  try { parts = url.pathname.split('/').filter(Boolean).map(decodeURIComponent); } catch { throw Object.assign(new Error('Invalid work-item URL encoding.'), { status: 400 }); }
  const organization = legacy ? legacy[1] : parts[0];
  const project = legacy ? parts[0] : parts[1];
  const edit = parts.indexOf('_workitems');
  const id = edit >= 0 && parts[edit + 1] === 'edit' ? parts[edit + 2] : '';
  if (!organization || !project || !segment.test(organization) || !segment.test(project) || !/^\d{1,12}$/.test(id ?? '') || parts.length !== (legacy ? 4 : 5)) throw Object.assign(new Error('Use a direct work-item link ending in /_workitems/edit/123.'), { status: 400 });
  return { organization, project, id };
}

const kindOf = (type) => type === 'Epic' ? 'epic' : type === 'Feature' ? 'feature' : ['Task', 'Bug', 'User Story', 'Product Backlog Item', 'Issue'].includes(type) ? 'ticket' : null;
const stateOf = (state) => ['Closed', 'Done', 'Resolved', 'Completed'].includes(state) ? 'completed' : ['Active', 'Doing', 'In Progress', 'Committed'].includes(state) ? 'in_progress' : ['Blocked'].includes(state) ? 'blocked' : ['Removed', 'Cancelled'].includes(state) ? 'cancelled' : 'not_started';
const plainText = (value) => String(value ?? '').replace(/<br\s*\/?\s*>|<\/(?:p|div|li)>/gi, '\n').replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim().slice(0, 10000);

/**
 * Read-only, bounded metadata lookup. PAT is server-only, never returned or
 * persisted. Redirects are rejected so an allowed first URL cannot redirect
 * the credential to another host. Intermediate Azure User Stories are omitted
 * from the canonical epic → feature → ticket view (not silently reparented in ADO).
 */
export async function lookupDevopsWorkItem(input, { pat, fetchImpl = fetch, timeoutMs = 12000 } = {}) {
  const target = parseWorkItemUrl(input);
  if (!pat || typeof pat !== 'string' || pat.length > 512 || /[\r\n]/.test(pat)) throw Object.assign(new Error('Azure DevOps lookup is not configured. Set AZURE_DEVOPS_PAT on the server, or use CSV/JSON upload.'), { status: 503 });
  const base = `https://dev.azure.com/${encodeURIComponent(target.organization)}/${encodeURIComponent(target.project)}/_apis/wit/workitems/`;
  const get = async (id) => {
    let response;
    try {
      response = await fetchImpl(`${base}${id}?$expand=relations&api-version=7.1`, {
        headers: { Accept: 'application/json', Authorization: `Basic ${Buffer.from(`:${pat}`).toString('base64')}` },
        redirect: 'error', signal: AbortSignal.timeout(timeoutMs),
      });
    } catch { throw Object.assign(new Error('Azure DevOps could not be reached. Try again or use a CSV/JSON export.'), { status: 502 }); }
    if (!response.ok) {
      const message = response.status === 401 || response.status === 403 ? 'Azure DevOps denied access. Check the server PAT has Work Items (Read) permission for this project.'
        : response.status === 404 ? 'Work item or project not found, or the server identity cannot access it.'
        : response.status === 429 ? 'Azure DevOps is rate limiting requests. Wait before retrying.'
        : 'Azure DevOps lookup failed. Use a CSV/JSON export or retry later.';
      throw Object.assign(new Error(message), { status: response.status === 404 ? 404 : response.status === 429 ? 429 : 502 });
    }
    // Bound memory even if the provider ignores our requested field set.
    const text = await response.text();
    if (text.length > 512 * 1024) throw Object.assign(new Error('Azure DevOps returned an unexpectedly large work item.'), { status: 502 });
    try { return JSON.parse(text); } catch { throw Object.assign(new Error('Azure DevOps returned invalid metadata.'), { status: 502 }); }
  };
  const chain = []; const seen = new Set(); let id = target.id;
  while (id && !seen.has(id) && chain.length < 6) {
    seen.add(id);
    const item = await get(id); const fields = item?.fields;
    if (!fields || !kindOf(fields['System.WorkItemType'])) throw Object.assign(new Error('This work-item type is not supported. Use Epic, Feature, Task, Bug, User Story or Product Backlog Item.'), { status: 422 });
    const estimate = Number(fields['Microsoft.VSTS.Scheduling.OriginalEstimate'] ?? fields['Microsoft.VSTS.Scheduling.Effort'] ?? fields['Microsoft.VSTS.Scheduling.StoryPoints'] ?? 0);
    // Story points are not hours. Never convert them implicitly.
    const hasHours = fields['Microsoft.VSTS.Scheduling.OriginalEstimate'] != null || fields['Microsoft.VSTS.Scheduling.Effort'] != null;
    chain.push({
      externalId: String(item.id), kind: kindOf(fields['System.WorkItemType']), title: plainText(fields['System.Title']).slice(0, 500),
      parentExternalId: '', description: plainText(fields['System.Description']),
      acceptanceCriteria: plainText(fields['Microsoft.VSTS.Common.AcceptanceCriteria']),
      departmentCode: '', projectCode: '', streamCode: '',
      assigneeEmail: fields['System.AssignedTo']?.uniqueName ?? '', funding: 'unclassified', phase: 'discovery', status: stateOf(fields['System.State']),
      estimateHours: hasHours && Number.isFinite(estimate) ? Math.max(0, Math.min(100000, estimate)) : 0,
      externalUrl: `https://dev.azure.com/${encodeURIComponent(target.organization)}/${encodeURIComponent(target.project)}/_workitems/edit/${item.id}`,
      organization: target.organization, devopsProject: target.project,
    });
    const relation = Array.isArray(item.relations) ? item.relations.find((r) => r.rel === 'System.LinkTypes.Hierarchy-Reverse') : null;
    const parentId = relation?.url?.match(/\/workitems\/(\d+)(?:\?.*)?$/i)?.[1];
    chain[chain.length - 1].parentExternalId = parentId ?? '';
    id = parentId;
  }
  if (id && !seen.has(id)) throw Object.assign(new Error('The parent chain is too deep or contains a cycle. Use a mapped CSV import.'), { status: 422 });
  const current = chain[0];
  const feature = current.kind === 'feature' ? current : chain.find((i) => i.kind === 'feature');
  const epic = current.kind === 'epic' ? current : chain.find((i) => i.kind === 'epic');
  let items;
  if (current.kind === 'epic') items = [current];
  else if (current.kind === 'feature') {
    if (!epic) throw Object.assign(new Error('This feature has no epic ancestor. Add the epic in Azure DevOps or map a parent in the CSV template.'), { status: 422 });
    items = [epic, { ...current, parentExternalId: epic.externalId }];
  } else {
    if (!epic || !feature) throw Object.assign(new Error('This ticket needs both feature and epic ancestors for the three-level import. Supply those links in Azure DevOps or map parentExternalId in the CSV template.'), { status: 422 });
    items = [epic, { ...feature, parentExternalId: epic.externalId }, { ...current, parentExternalId: feature.externalId }];
  }
  return { items, source: 'azure_devops', readOnly: true, note: 'Review project, stream and funding mappings before import. Intermediate Azure user-story levels are not copied into the canonical three-level view.' };
}
