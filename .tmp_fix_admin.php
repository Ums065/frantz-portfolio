<?php
$path = __DIR__ . '/frontend/src/pages/Admin.tsx';
$text = file_get_contents($path);
if ($text === false) { fwrite(STDERR, "read failed\n"); exit(1); }

$text = str_replace(
    "  const schoolMap = useMemo(() => new Map<number, any>(nsSchools.map((school: any) => [Number(school.id), school])), [nsSchools])\r\n  const schoolMap = useMemo(() => new Map<number, any>(nsSchools.map((school: any) => [Number(school.id), school])), [nsSchools])",
    "  const schoolMap = useMemo(() => new Map<number, any>(nsSchools.map((school: any) => [Number(school.id), school])), [nsSchools])",
    $text
);

$approvalsPattern = '~\s*<DataTable\R\s*head=\{\[\'#\', \'Name\', \'User ID\', \'Email\', \'Role\', \'School\', \'Status\', \'Reviewed\', \'\'\]\}.*?\R\s*/>~s';
$approvalsReplacement = <<<'TSX'
            <DataTable
              head={['#', 'Name', 'User ID', 'Email', 'Role', 'School', 'Status', 'Reviewed', '']}
              rows={(data?.members ?? []).filter((m) => !isAdmin(m.role) && (m.approval_status || 'pending') !== 'approved')}
              searchPlaceholder="Search pending accounts…"
              searchText={(m) => `${m.full_name} ${m.email} ${m.role} ${m.id} ${m.school_name ?? ''}`}
              statusOf={(m) => (m.approval_status || 'pending')}
              statusOptions={['pending', 'rejected']}
              rowId={(m) => m.id}
              bulkActions={[
                { label: 'Approve selected', onClick: (ids) => bulkSetApproval(ids, 'approved') },
                { label: 'Reject selected', danger: true, onClick: (ids) => bulkSetApproval(ids, 'rejected') },
                { label: 'Delete selected', danger: true, onClick: (ids) => bulkDelete('admin/user', ids, 'account') },
              ]}
              renderRow={(m, checkbox, index) => {
                const status = (m.approval_status || 'pending').toLowerCase()
                const linkedSchool = m.school_id ? schoolMap.get(Number(m.school_id)) : null
                return (
                  <tr key={m.id}>{checkbox}
                    <td className="admin-table__idx">{index}</td>
                    <td>{m.full_name}</td>
                    <td className="admin-table__uid">#{m.id}</td>
                    <td>{m.email}</td>
                    <td>{m.role}</td>
                    <td>
                      {m.school_name ? (
                        <div>
                          <div>{m.school_name}</div>
                          <div style={{ color: 'var(--muted)', fontSize: 12 }}>
                            {linkedSchool?.status ? `School: ${linkedSchool.status}` : 'School status unavailable'}
                          </div>
                        </div>
                      ) : '—'}
                    </td>
                    <td><StatusPill status={status} /></td>
                    <td>{m.approval_reviewed_at || '—'}</td>
                    <td>
                      <RowMenu actions={[
                        { label: viewBusyId === m.id ? 'Opening…' : 'View dashboard', onClick: () => void viewAsUser(m), disabled: viewBusyId === m.id },
                        { label: 'Details', onClick: () => void openUserDetails(m) },
                        { label: 'Approve', onClick: () => void setApproval(m.id, 'approved'), disabled: status === 'approved' },
                        { label: 'Keep pending', onClick: () => void setApproval(m.id, 'pending'), disabled: status === 'pending' },
                        { label: 'Reject', onClick: () => void setApproval(m.id, 'rejected'), disabled: status === 'rejected' },
                        { label: 'Delete account', danger: true, onClick: () => void deleteRow(`admin/user/${m.id}`, `Permanently delete ${m.full_name}'s account? This cannot be undone.`) },
                      ]} />
                    </td>
                  </tr>
                )
              }}
            />
TSX;
$text = preg_replace($approvalsPattern, "\n" . $approvalsReplacement, $text, 1);

$text = str_replace(
    "                    <p>{(s.school_district || '—')} · {s.status}</p>",
    "                    <p>{[s.school_district || '—', s.origin === 'trendcatch_edu' ? 'TrendCatch EDU' : 'Principal', s.claim_status === 'claimed' ? 'Claimed' : s.status].filter(Boolean).join(' · ')}</p>",
    $text
);

$text = str_replace(
    "                      {selectedDashSchool.school_address && <span><b>Address:</b> {selectedDashSchool.school_address}</span>}",
    "                      {selectedDashSchool.school_address && <span><b>Address:</b> {selectedDashSchool.school_address}</span>}\n                      {selectedDashSchool.school_website && <span><b>Website:</b> {selectedDashSchool.school_website}</span>}\n                      <span><b>Origin:</b> {selectedDashSchool.origin === 'trendcatch_edu' ? 'TrendCatch EDU' : 'Principal'}</span>\n                      <span><b>Claim:</b> {selectedDashSchool.claim_status === 'claimed' ? 'Claimed' : 'Unclaimed'}</span>",
    $text
);

$trendPattern = '~\s*<p className=\\"ns-edu-intro\\">.*?<form className=\\"glass ns-edu-create\\".*?</form>~s';
$trendReplacement = <<<'TSX'
            <p className="ns-edu-intro">
              Schools that joined through &ldquo;Register under TrendCatch EDU&rdquo; (their school wasn&rsquo;t listed yet). You steward each one — approve its teachers &amp; students and <strong>Make live</strong> so it appears in the public dropdown — until a principal <strong>claims</strong> it and takes over.
            </p>
            <form className="glass ns-edu-create" onSubmit={(e) => void submitEduSchoolCreate(e)}>
              <div className="ns-edu-create__head">
                <div>
                  <strong>Create and publish a school</strong>
                  <p>Use this when a principal has not registered yet but the school needs to go live so teachers, students, and parents can join.</p>
                </div>
                <button type="submit" className="btn btn--sm btn--solid" disabled={nsEduBusy === 'create'}>
                  {nsEduBusy === 'create' ? 'Publishing...' : 'Create school'}
                </button>
              </div>
              <div className="ns-edu-claim__grid">
                <label>School name<input name="school_name" required /></label>
                <label>District<input name="school_district" /></label>
                <label>Main phone<input name="main_phone" /></label>
                <label>Principal name<input name="principal_name" /></label>
                <label>Administrator name<input name="administrator_name" /></label>
                <label>Administrator email<input name="administrator_email" type="email" /></label>
                <label>Administrator phone<input name="administrator_phone" /></label>
                <label>Website<input name="school_website" /></label>
                <label style={{ gridColumn: '1 / -1' }}>Address<input name="school_address" /></label>
              </div>
            </form>
TSX;
$text = preg_replace($trendPattern, "\n" . $trendReplacement, $text, 1);

$text = str_replace(
    "                      <p className=\"ns-edu-card__meta\">{school.administrator_email || 'no email'}{school.school_website ? ` Â· ${school.school_website}` : ''}</p>`r`n                      <p className=\"ns-edu-card__meta\">{[school.school_district, school.main_phone, school.principal_name].filter(Boolean).join(' Â· ') || 'Awaiting school details'}</p>",
    "                      <p className=\"ns-edu-card__meta\">{school.administrator_email || 'no email'}{school.school_website ? ` · ${school.school_website}` : ''}</p>\n                      <p className=\"ns-edu-card__meta\">{[school.school_district, school.main_phone, school.principal_name].filter(Boolean).join(' · ') || 'Awaiting school details'}</p>",
    $text
);

$text = str_replace(
    "                      {school.status !== 'rejected' && school.status !== 'approved' && (`r`n                        <button type=\"button\" className=\"btn btn--sm\" disabled={nsEduBusy === `reject-${school.id}`} onClick={() => void eduRejectSchool(school.id)}>`r`n                          {nsEduBusy === `reject-${school.id}` ? 'Saving...' : 'Reject'}`r`n                        </button>`r`n                      )}`r`n                      <button type=\"button\" className=\"btn btn--sm\" onClick={() => setClaimSchoolId(claiming ? null : school.id)}>",
    "                      {school.status !== 'rejected' && school.status !== 'approved' && (\n                        <button type=\"button\" className=\"btn btn--sm\" disabled={nsEduBusy === `reject-${school.id}`} onClick={() => void eduRejectSchool(school.id)}>\n                          {nsEduBusy === `reject-${school.id}` ? 'Saving...' : 'Reject'}\n                        </button>\n                      )}\n                      <button type=\"button\" className=\"btn btn--sm\" onClick={() => setClaimSchoolId(claiming ? null : school.id)}>",
    $text
);

$text = str_replace('<label>Principal name<input name="principal_name" required /></label>', '<label>Principal name<input name="principal_name" required defaultValue={school.principal_name || ""} /></label>', $text);
$text = str_replace('<label>Administrator name<input name="administrator_name" placeholder="(defaults to principal)" /></label>', '<label>Administrator name<input name="administrator_name" placeholder="(defaults to principal)" defaultValue={school.administrator_name || ""} /></label>', $text);
$text = str_replace('<label>Principal phone<input name="administrator_phone" required /></label>', '<label>Principal phone<input name="administrator_phone" required defaultValue={school.main_phone || ""} /></label>', $text);
$text = str_replace('<label>Main phone<input name="main_phone" placeholder="(defaults to principal phone)" /></label>', '<label>Main phone<input name="main_phone" placeholder="(defaults to principal phone)" defaultValue={school.main_phone || ""} /></label>', $text);
$text = str_replace('<label>District<input name="school_district" required /></label>', '<label>District<input name="school_district" required defaultValue={school.school_district || ""} /></label>', $text);
$text = str_replace('<label>Address<input name="school_address" required /></label>', '<label>Address<input name="school_address" required defaultValue={school.school_address || ""} /></label>', $text);

file_put_contents($path, $text);
?>
