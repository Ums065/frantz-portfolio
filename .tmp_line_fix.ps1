$path = 'frontend/src/pages/Admin.tsx'
$lines = [System.Collections.Generic.List[string]](Get-Content $path)
function Replace-Range($list, [int]$start, [int]$end, [string[]]$newLines) {
  for ($i = $end; $i -ge $start; $i--) { $list.RemoveAt($i) }
  for ($i = 0; $i -lt $newLines.Count; $i++) { $list.Insert($start + $i, $newLines[$i]) }
}
for ($i = 1; $i -lt $lines.Count; $i++) {
  if ($lines[$i] -eq $lines[$i - 1] -and $lines[$i] -like '*const schoolMap = useMemo*') { $lines.RemoveAt($i); break }
}
$approvalsStart = $lines.IndexOf('            <DataTable')
while ($approvalsStart -gt 0 -and $lines[$approvalsStart - 1] -notlike '*{tab === ''approvals'' && (*') { $approvalsStart = $lines.IndexOf('            <DataTable', $approvalsStart + 1) }
$approvalsEnd = $approvalsStart
while ($lines[$approvalsEnd] -ne '            />') { $approvalsEnd++ }
Replace-Range $lines $approvalsStart $approvalsEnd @(
'            <DataTable',
'              head={[''#'', ''Name'', ''User ID'', ''Email'', ''Role'', ''School'', ''Status'', ''Reviewed'', '''']}',
'              rows={(data?.members ?? []).filter((m) => !isAdmin(m.role) && (m.approval_status || ''pending'') !== ''approved'')}',
'              searchPlaceholder="Search pending accounts…"',
'              searchText={(m) => `${m.full_name} ${m.email} ${m.role} ${m.id} ${m.school_name ?? ''''}`}',
'              statusOf={(m) => (m.approval_status || ''pending'')}',
'              statusOptions={[''pending'', ''rejected'']}',
'              rowId={(m) => m.id}',
'              bulkActions={[',
'                { label: ''Approve selected'', onClick: (ids) => bulkSetApproval(ids, ''approved'') },',
'                { label: ''Reject selected'', danger: true, onClick: (ids) => bulkSetApproval(ids, ''rejected'') },',
'                { label: ''Delete selected'', danger: true, onClick: (ids) => bulkDelete(''admin/user'', ids, ''account'') },',
'              ]}',
'              renderRow={(m, checkbox, index) => {',
'                const status = (m.approval_status || ''pending'').toLowerCase()',
'                const linkedSchool = m.school_id ? schoolMap.get(Number(m.school_id)) : null',
'                return (',
'                  <tr key={m.id}>{checkbox}',
'                    <td className="admin-table__idx">{index}</td>',
'                    <td>{m.full_name}</td>',
'                    <td className="admin-table__uid">#{m.id}</td>',
'                    <td>{m.email}</td>',
'                    <td>{m.role}</td>',
'                    <td>',
'                      {m.school_name ? (',
'                        <div>',
'                          <div>{m.school_name}</div>',
'                          <div style={{ color: ''var(--muted)'', fontSize: 12 }}>',
'                            {linkedSchool?.status ? `School: ${linkedSchool.status}` : ''School status unavailable''}',
'                          </div>',
'                        </div>',
'                      ) : ''—''}',
'                    </td>',
'                    <td><StatusPill status={status} /></td>',
'                    <td>{m.approval_reviewed_at || ''—''}</td>',
'                    <td>',
'                      <RowMenu actions={[',
'                        { label: viewBusyId === m.id ? ''Opening…'' : ''View dashboard'', onClick: () => void viewAsUser(m), disabled: viewBusyId === m.id },',
'                        { label: ''Details'', onClick: () => void openUserDetails(m) },',
'                        { label: ''Approve'', onClick: () => void setApproval(m.id, ''approved''), disabled: status === ''approved'' },',
'                        { label: ''Keep pending'', onClick: () => void setApproval(m.id, ''pending''), disabled: status === ''pending'' },',
'                        { label: ''Reject'', onClick: () => void setApproval(m.id, ''rejected''), disabled: status === ''rejected'' },',
'                        { label: ''Delete account'', danger: true, onClick: () => void deleteRow(`admin/user/${m.id}`, `Permanently delete ${m.full_name}''s account? This cannot be undone.`) },',
'                      ]} />',
'                    </td>',
'                  </tr>',
'                )',
'              }}',
'            />'
)
$addressIdx = $lines.IndexOf('                      {selectedDashSchool.school_address && <span><b>Address:</b> {selectedDashSchool.school_address}</span>}')
if ($addressIdx -ge 0) {
  Replace-Range $lines $addressIdx $addressIdx @(
'                      {selectedDashSchool.school_address && <span><b>Address:</b> {selectedDashSchool.school_address}</span>}',
'                      {selectedDashSchool.school_website && <span><b>Website:</b> {selectedDashSchool.school_website}</span>}',
'                      <span><b>Origin:</b> {selectedDashSchool.origin === ''trendcatch_edu'' ? ''TrendCatch EDU'' : ''Principal''}</span>',
'                      <span><b>Claim:</b> {selectedDashSchool.claim_status === ''claimed'' ? ''Claimed'' : ''Unclaimed''}</span>'
  )
}
$schoolCardMetaIdx = $lines.IndexOf('                    <p>{(s.school_district || ''—'') · {s.status}</p>')
if ($schoolCardMetaIdx -ge 0) { $lines[$schoolCardMetaIdx] = '                    <p>{[s.school_district || ''—'', s.origin === ''trendcatch_edu'' ? ''TrendCatch EDU'' : ''Principal'', s.claim_status === ''claimed'' ? ''Claimed'' : s.status].filter(Boolean).join('' · '')}</p>' }
$trendStart = $lines.IndexOf('            <p className="ns-edu-intro">')
$trendEnd = $trendStart
while ($lines[$trendEnd] -ne '            </form>') { $trendEnd++ }
Replace-Range $lines $trendStart $trendEnd @(
'            <p className="ns-edu-intro">',
'              Schools that joined through &ldquo;Register under TrendCatch EDU&rdquo; (their school wasn&rsquo;t listed yet). You steward each one — approve its teachers &amp; students and <strong>Make live</strong> so it appears in the public dropdown — until a principal <strong>claims</strong> it and takes over.',
'            </p>',
'            <form className="glass ns-edu-create" onSubmit={(e) => void submitEduSchoolCreate(e)}>',
'              <div className="ns-edu-create__head">',
'                <div>',
'                  <strong>Create and publish a school</strong>',
'                  <p>Use this when a principal has not registered yet but the school needs to go live so teachers, students, and parents can join.</p>',
'                </div>',
'                <button type="submit" className="btn btn--sm btn--solid" disabled={nsEduBusy === ''create''}>',
'                  {nsEduBusy === ''create'' ? ''Publishing...'' : ''Create school''}',
'                </button>',
'              </div>',
'              <div className="ns-edu-claim__grid">',
'                <label>School name<input name="school_name" required /></label>',
'                <label>District<input name="school_district" /></label>',
'                <label>Main phone<input name="main_phone" /></label>',
'                <label>Principal name<input name="principal_name" /></label>',
'                <label>Administrator name<input name="administrator_name" /></label>',
'                <label>Administrator email<input name="administrator_email" type="email" /></label>',
'                <label>Administrator phone<input name="administrator_phone" /></label>',
'                <label>Website<input name="school_website" /></label>',
'                <label style={{ gridColumn: ''1 / -1'' }}>Address<input name="school_address" /></label>',
'              </div>',
'            </form>'
)
$metaIdx = $lines.IndexOf('                      <p className="ns-edu-card__meta">{school.administrator_email || ''no email''}{school.school_website ? ` Â· ${school.school_website}` : ''''}</p>`r`n                      <p className="ns-edu-card__meta">{[school.school_district, school.main_phone, school.principal_name].filter(Boolean).join('' Â· '') || ''Awaiting school details''}</p>')
if ($metaIdx -ge 0) {
  Replace-Range $lines $metaIdx $metaIdx @(
'                      <p className="ns-edu-card__meta">{school.administrator_email || ''no email''}{school.school_website ? ` · ${school.school_website}` : ''''}</p>',
'                      <p className="ns-edu-card__meta">{[school.school_district, school.main_phone, school.principal_name].filter(Boolean).join('' · '') || ''Awaiting school details''}</p>'
  )
}
$rejectIdx = $lines.IndexOf('                      {school.status !== ''rejected'' && school.status !== ''approved'' && (`r`n                        <button type="button" className="btn btn--sm" disabled={nsEduBusy === `reject-${school.id}`} onClick={() => void eduRejectSchool(school.id)}>`r`n                          {nsEduBusy === `reject-${school.id}` ? ''Saving...'' : ''Reject''}`r`n                        </button>`r`n                      )}`r`n                      <button type="button" className="btn btn--sm" onClick={() => setClaimSchoolId(claiming ? null : school.id)}>')
if ($rejectIdx -ge 0) {
  Replace-Range $lines $rejectIdx $rejectIdx @(
'                      {school.status !== ''rejected'' && school.status !== ''approved'' && (',
'                        <button type="button" className="btn btn--sm" disabled={nsEduBusy === `reject-${school.id}`} onClick={() => void eduRejectSchool(school.id)}>',
'                          {nsEduBusy === `reject-${school.id}` ? ''Saving...'' : ''Reject''}',
'                        </button>',
'                      )}',
'                      <button type="button" className="btn btn--sm" onClick={() => setClaimSchoolId(claiming ? null : school.id)}>'
  )
}
$claimStart = $lines.IndexOf('                        <label>Principal name<input name="principal_name" required defaultValue={school.principal_name || ''} /></label>')
if ($claimStart -lt 0) { $claimStart = 1399 }
Replace-Range $lines $claimStart ($claimStart + 6) @(
'                        <label>Principal name<input name="principal_name" required defaultValue={school.principal_name || ""} /></label>',
'                        <label>Administrator name<input name="administrator_name" placeholder="(defaults to principal)" defaultValue={school.administrator_name || ""} /></label>',
'                        <label>Principal email<input name="administrator_email" type="email" required defaultValue={school.administrator_email || ''} /></label>',
'                        <label>Principal phone<input name="administrator_phone" required defaultValue={school.main_phone || ""} /></label>',
'                        <label>Main phone<input name="main_phone" placeholder="(defaults to principal phone)" defaultValue={school.main_phone || ""} /></label>',
'                        <label>District<input name="school_district" required defaultValue={school.school_district || ""} /></label>',
'                        <label>Address<input name="school_address" required defaultValue={school.school_address || ""} /></label>'
)
Set-Content -LiteralPath $path -Value $lines
