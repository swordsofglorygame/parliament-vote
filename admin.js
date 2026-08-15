const API_URL =
    "https://parliament-api.sog-parliament.workers.dev";

let adminSessionToken = null;
let currentFilter = "";
let currentElectionId = null;


/* =========================================================
   HELPERS
========================================================= */

function el(id) {
    return document.getElementById(id);
}

function showMessage(element, text, type = "error") {

    element.style.display = "block";
    element.textContent = text;

    if (type === "success") {
        element.style.background = "rgba(46,125,50,.15)";
        element.style.border = "1px solid rgba(76,175,80,.4)";
        element.style.color = "#9be7a0";
    } else {
        element.style.background = "rgba(198,40,40,.15)";
        element.style.border = "1px solid rgba(239,83,80,.4)";
        element.style.color = "#ff9d9d";
    }
}

function hideMessage(element) {
    element.style.display = "none";
    element.textContent = "";
}

function escapeHtml(value) {

    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function formatDate(value) {

    if (!value) {
        return "-";
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return value;
    }

    return date.toISOString()
        .replace("T", " ")
        .replace(".000Z", " UTC");
}

function statusText(status) {

    const map = {
        draft: "Draft",
        scheduled: "مجدولة",
        open: "جارية",
        closed: "منتهية",
        cancelled: "ملغاة"
    };

    return map[status] || status;
}

function statusBadge(status) {

    return `
        <span class="badge badge-${escapeHtml(status)}">
            ${escapeHtml(statusText(status))}
        </span>
    `;
}


/* =========================================================
   AUTH
========================================================= */

async function apiFetch(
    path,
    options = {}
) {

    options.headers = {
        ...(options.headers || {}),
        "Content-Type": "application/json"
    };

    if (adminSessionToken) {

        options.headers.Authorization =
            `Bearer ${adminSessionToken}`;
    }

    const response =
        await fetch(
            `${API_URL}${path}`,
            options
        );

    if (response.status === 401) {

        logoutLocal(
            "انتهت جلسة الإدارة. يرجى تسجيل الدخول مرة أخرى."
        );

        throw new Error(
            "UNAUTHORIZED"
        );
    }

    return response;
}


function logoutLocal(message = "") {

    adminSessionToken = null;

    el("dashboardCard").style.display =
        "none";

    el("loginCard").style.display =
        "block";

    if (message) {

        showMessage(
            el("loginMessage"),
            message
        );
    }
}


async function login(
    email,
    password
) {

    const response =
        await fetch(
            `${API_URL}/admin/login`,
            {
                method: "POST",

                headers: {
                    "Content-Type":
                        "application/json"
                },

                body:
                    JSON.stringify({
                        email,
                        password
                    })
            }
        );

    const data =
        await response.json();

    if (
        !response.ok ||
        !data.success
    ) {

        throw new Error(
            data.message ||
            "بيانات الدخول غير صحيحة."
        );
    }

    adminSessionToken =
        data.token;
}


async function verifySession() {

    if (!adminSessionToken) {
        return false;
    }

    try {

        const response =
            await apiFetch(
                "/admin/test",
                {
                    method: "GET"
                }
            );

        const data =
            await response.json();

        return (
            response.ok &&
            data.success
        );

    } catch {

        return false;
    }
}


/* =========================================================
   LOGIN FORM
========================================================= */

el("loginForm")
    .addEventListener(
        "submit",
        async event => {

            event.preventDefault();

            hideMessage(
                el("loginMessage")
            );

            const email =
                el("adminEmail")
                    .value
                    .trim();

            const password =
                el("adminPassword")
                    .value;

            if (!email || !password) {

                showMessage(
                    el("loginMessage"),
                    "البريد الإلكتروني وكلمة المرور مطلوبان."
                );

                return;
            }

            el("loginButton").disabled =
                true;

            el("loginButton").textContent =
                "جاري الدخول...";

            try {

                await login(
                    email,
                    password
                );

                el("adminEmailDisplay")
                    .textContent = email;

                el("adminPassword")
                    .value = "";

                el("loginCard").style.display =
                    "none";

                el("dashboardCard").style.display =
                    "block";

                await refreshDashboard();

            } catch (error) {

                showMessage(
                    el("loginMessage"),
                    error.message ||
                    "تعذر تسجيل الدخول."
                );

            } finally {

                el("loginButton").disabled =
                    false;

                el("loginButton").textContent =
                    "تسجيل الدخول";
            }
        }
    );


/* =========================================================
   LOGOUT
========================================================= */

el("logoutButton")
    .addEventListener(
        "click",
        async () => {

            try {

                if (adminSessionToken) {

                    await fetch(
                        `${API_URL}/admin/logout`,
                        {
                            method: "POST",

                            headers: {
                                "Authorization":
                                    `Bearer ${adminSessionToken}`
                            }
                        }
                    );
                }

            } catch {}

            logoutLocal();
        }
    );


/* =========================================================
   NAVIGATION
========================================================= */

document
    .querySelectorAll(
        ".admin-nav button"
    )
    .forEach(button => {

        button.addEventListener(
            "click",
            async () => {

                document
                    .querySelectorAll(
                        ".admin-nav button"
                    )
                    .forEach(btn =>
                        btn.classList.remove(
                            "active"
                        )
                    );

                document
                    .querySelectorAll(
                        ".admin-section"
                    )
                    .forEach(section =>
                        section.classList.remove(
                            "active"
                        )
                    );

                button.classList.add(
                    "active"
                );

                const section =
                    el(
                        button.dataset.section
                    );

                if (section) {
                    section.classList.add(
                        "active"
                    );
                }

                if (
                    button.dataset.section ===
                    "dashboardSection"
                ) {
                    await refreshDashboard();
                }

                if (
                    button.dataset.section ===
                    "electionsSection"
                ) {
                    await loadElections(
                        currentFilter
                    );
                }
            }
        );
    });


/* =========================================================
   DASHBOARD
========================================================= */

async function refreshDashboard() {

    try {

        const response =
            await apiFetch(
                "/admin/stats"
            );

        const data =
            await response.json();

        if (!response.ok) {
            return;
        }

        const elections =
            data.elections || {};

        el("statTotalElections")
            .textContent =
            elections.total_elections ?? 0;

        el("statActive")
            .textContent =
            elections.active_count ?? 0;

        el("statClosed")
            .textContent =
            elections.closed_count ?? 0;

        el("statVotes")
            .textContent =
            data.total_votes ?? 0;


        const openResponse =
            await apiFetch(
                "/admin/elections?status=open"
            );

        const openData =
            await openResponse.json();

        renderDashboardOpen(
            openData.elections || []
        );

    } catch (error) {

        console.error(error);
    }
}


function renderDashboardOpen(
    elections
) {

    const container =
        el("dashboardOpenList");

    if (!elections.length) {

        container.innerHTML = `
            <div class="empty-state">
                لا توجد عمليات تصويت جارية حاليًا.
            </div>
        `;

        return;
    }

    container.innerHTML =
        elections
            .map(election =>
                electionCardHtml(
                    election
                )
            )
            .join("");
}


/* =========================================================
   ELECTIONS LIST
========================================================= */

document
    .querySelectorAll(
        ".filter-btn"
    )
    .forEach(button => {

        button.addEventListener(
            "click",
            async () => {

                document
                    .querySelectorAll(
                        ".filter-btn"
                    )
                    .forEach(btn =>
                        btn.classList.remove(
                            "active"
                        )
                    );

                button.classList.add(
                    "active"
                );

                currentFilter =
                    button.dataset.status ||
                    "";

                await loadElections(
                    currentFilter
                );
            }
        );
    });


async function loadElections(
    status = ""
) {

    const container =
        el("electionsList");

    container.innerHTML = `
        <div class="empty-state">
            جاري تحميل البيانات...
        </div>
    `;

    try {

        const query =
            status
                ? `?status=${encodeURIComponent(status)}`
                : "";

        const response =
            await apiFetch(
                `/admin/elections${query}`
            );

        const data =
            await response.json();

        if (!response.ok) {

            container.innerHTML = `
                <div class="empty-state">
                    تعذر تحميل عمليات التصويت.
                </div>
            `;

            return;
        }

        const elections =
            data.elections || [];

        if (!elections.length) {

            container.innerHTML = `
                <div class="empty-state">
                    لا توجد عمليات تصويت في هذا القسم.
                </div>
            `;

            return;
        }

        container.innerHTML =
            elections
                .map(
                    election =>
                        electionCardHtml(
                            election
                        )
                )
                .join("");

    } catch (error) {

        console.error(error);

        container.innerHTML = `
            <div class="empty-state">
                حدث خطأ أثناء تحميل البيانات.
            </div>
        `;
    }
}


function electionCardHtml(
    election
) {

    const effectiveStatus =
        election.effective_status ||
        election.status;

    return `
        <div class="election-card">

            <div class="election-header">

                <div>

                    <div class="election-title">
                        ${escapeHtml(
                            election.title
                        )}
                    </div>

                    <div class="election-id">
                        ${escapeHtml(
                            election.election_id
                        )}
                    </div>

                </div>

                <div>
                    ${statusBadge(
                        effectiveStatus
                    )}
                </div>

            </div>

            <div class="meta-grid">

                <div class="meta-item">
                    <div class="meta-label">
                        السيرفر
                    </div>
                    <div class="meta-value">
                        ${election.server_id}
                    </div>
                </div>

                <div class="meta-item">
                    <div class="meta-label">
                        المقاعد
                    </div>
                    <div class="meta-value">
                        ${election.seats}
                    </div>
                </div>

                <div class="meta-item">
                    <div class="meta-label">
                        المرشحون
                    </div>
                    <div class="meta-value">
                        ${election.candidate_count ?? 0}
                    </div>
                </div>

                <div class="meta-item">
                    <div class="meta-label">
                        المصوتون
                    </div>
                    <div class="meta-value">
                        ${election.voter_count ?? 0}
                    </div>
                </div>

                <div class="meta-item">
                    <div class="meta-label">
                        المؤهلون
                    </div>
                    <div class="meta-value">
                        ${election.eligible_count ?? 0}
                    </div>
                </div>

                <div class="meta-item">
                    <div class="meta-label">
                        المشاركة
                    </div>
                    <div class="meta-value">
                        ${election.participation_rate ?? 0}%
                    </div>
                </div>

            </div>

            <div style="
                color:#82745f;
                font-size:11px;
                margin-bottom:12px;
            ">
                البداية:
                ${formatDate(
                    election.start_at
                )}
                <br>
                النهاية:
                ${formatDate(
                    election.end_at
                )}
            </div>

            <div class="small-actions">

                <button
                    class="info-btn"
                    onclick="openElectionDetails('${escapeHtml(
                        election.election_id
                    )}')"
                >
                    التفاصيل
                </button>

                <button
                    class="secondary-btn"
                    onclick="editElection('${escapeHtml(
                        election.election_id
                    )}')"
                >
                    تعديل
                </button>

                ${
                    effectiveStatus === "draft" ||
                    effectiveStatus === "scheduled"
                        ? `
                            <button
                                class="success-btn"
                                onclick="openElectionNow('${escapeHtml(
                                    election.election_id
                                )}')"
                            >
                                فتح الآن
                            </button>
                        `
                        : ""
                }

                ${
                    effectiveStatus === "open"
                        ? `
                            <button
                                class="danger-btn"
                                onclick="closeElection('${escapeHtml(
                                    election.election_id
                                )}')"
                            >
                                إنهاء التصويت
                            </button>
                        `
                        : ""
                }

                ${
                    effectiveStatus !== "closed" &&
                    effectiveStatus !== "cancelled"
                        ? `
                            <button
                                class="danger-btn"
                                onclick="cancelElection('${escapeHtml(
                                    election.election_id
                                )}')"
                            >
                                إلغاء
                            </button>
                        `
                        : ""
                }

            </div>

        </div>
    `;
}


/* =========================================================
   DETAILS MODAL
========================================================= */

window.openElectionDetails =
    async function(
        electionId
    ) {

        currentElectionId =
            electionId;

        el("electionModal")
            .classList.add(
                "active"
            );

        el("modalBody")
            .innerHTML =
            `<div class="empty-state">جاري التحميل...</div>`;

        try {

            const response =
                await apiFetch(
                    `/admin/election/${encodeURIComponent(
                        electionId
                    )}`
                );

            const data =
                await response.json();

            if (!response.ok) {

                el("modalBody")
                    .innerHTML =
                    `<div class="empty-state">تعذر تحميل التفاصيل.</div>`;

                return;
            }

            const election =
                data.election;

            el("modalTitle")
                .textContent =
                election.title;

            el("modalElectionId")
                .textContent =
                election.election_id;


            const votersResponse =
                await apiFetch(
                    `/admin/election/${encodeURIComponent(
                        electionId
                    )}/voters?limit=500`
                );

            const votersData =
                await votersResponse.json();


            const resultsResponse =
                await apiFetch(
                    `/admin/election/${encodeURIComponent(
                        electionId
                    )}/results`
                );

            const resultsData =
                await resultsResponse.json();


            const candidates =
                data.candidates || [];

            const voters =
                votersData.voters || [];

            const results =
                resultsData.results || [];

            let html = `

                <div class="detail-grid">

                    <div class="meta-item">
                        <div class="meta-label">
                            الحالة
                        </div>
                        <div class="meta-value">
                            ${statusBadge(
                                election.effective_status
                            )}
                        </div>
                    </div>

                    <div class="meta-item">
                        <div class="meta-label">
                            السيرفر
                        </div>
                        <div class="meta-value">
                            ${election.server_id}
                        </div>
                    </div>

                    <div class="meta-item">
                        <div class="meta-label">
                            البداية
                        </div>
                        <div class="meta-value">
                            ${formatDate(
                                election.start_at
                            )}
                        </div>
                    </div>

                    <div class="meta-item">
                        <div class="meta-label">
                            النهاية
                        </div>
                        <div class="meta-value">
                            ${formatDate(
                                election.end_at
                            )}
                        </div>
                    </div>

                    <div class="meta-item">
                        <div class="meta-label">
                            المصوتون
                        </div>
                        <div class="meta-value">
                            ${election.voter_count}
                        </div>
                    </div>

                    <div class="meta-item">
                        <div class="meta-label">
                            المشاركة
                        </div>
                        <div class="meta-value">
                            ${election.participation_rate}%
                        </div>
                    </div>

                </div>


                <div class="admin-box">

                    <h3>
                        المرشحون
                    </h3>

                    ${
                        candidates.length
                            ? candidates.map(
                                candidate =>
                                    `
                                    <div class="candidate-row">

                                        <div>
                                            <div class="candidate-name">
                                                ${escapeHtml(
                                                    candidate.nickname
                                                )}
                                            </div>

                                            <div class="candidate-uid">
                                                UID: ${escapeHtml(
                                                    candidate.uid
                                                )}
                                            </div>
                                        </div>

                                        ${
                                            election.effective_status === "draft" ||
                                            election.effective_status === "scheduled"
                                                ? `
                                                    <button
                                                        class="danger-btn"
                                                        style="width:auto;margin:0;padding:7px 10px;font-size:11px;"
                                                        onclick="deleteCandidate('${escapeHtml(
                                                            election.election_id
                                                        )}',${candidate.candidate_id})"
                                                    >
                                                        حذف
                                                    </button>
                                                `
                                                : ""
                                        }

                                    </div>
                                    `
                            ).join("")
                            : `
                                <div class="empty-state">
                                    لا يوجد مرشحون.
                                </div>
                            `
                    }

                    ${
                        election.effective_status === "draft" ||
                        election.effective_status === "scheduled"
                            ? `
                                <div style="margin-top:15px;">

                                    <div class="form-group">
                                        <label>
                                            إضافة مرشح بالـUID
                                        </label>

                                        <input
                                            type="text"
                                            id="candidateUidInput"
                                            placeholder="UID"
                                        >
                                    </div>

                                    <button
                                        type="button"
                                        class="success-btn"
                                        onclick="addCandidate('${escapeHtml(
                                            election.election_id
                                        )}')"
                                    >
                                        إضافة المرشح
                                    </button>

                                    <div
                                        id="candidateActionMessage"
                                        class="message"
                                    ></div>

                                </div>
                            `
                            : ""
                    }

                </div>


                <div class="admin-box">

                    <h3>
                        النتائج
                    </h3>

                    <div class="stat-grid" style="grid-template-columns:repeat(3,1fr);">

                        <div class="stat-card">
                            <div class="stat-label">
                                المصوتون
                            </div>
                            <div class="stat-value">
                                ${resultsData.stats?.voters ?? 0}
                            </div>
                        </div>

                        <div class="stat-card">
                            <div class="stat-label">
                                المؤهلون
                            </div>
                            <div class="stat-value">
                                ${resultsData.stats?.eligible ?? 0}
                            </div>
                        </div>

                        <div class="stat-card">
                            <div class="stat-label">
                                المشاركة
                            </div>
                            <div class="stat-value">
                                ${resultsData.stats?.participation_rate ?? 0}%
                            </div>
                        </div>

                    </div>

                    ${
                        results.length
                            ? results.map(
                                row =>
                                    `
                                    <div class="result-row">

                                        <div class="result-top">

                                            <span>
                                                ${escapeHtml(
                                                    row.nickname
                                                )}
                                            </span>

                                            <span>
                                                ${row.votes} صوت
                                                —
                                                ${row.percentage}%
                                            </span>

                                        </div>

                                        <div class="result-bar">

                                            <div
                                                class="result-fill"
                                                style="width:${Math.min(
                                                    Number(
                                                        row.percentage
                                                    ),
                                                    100
                                                )}%"
                                            ></div>

                                        </div>

                                    </div>
                                    `
                            ).join("")
                            : `
                                <div class="empty-state">
                                    لا توجد أصوات مسجلة.
                                </div>
                            `
                    }

                </div>


                <div class="admin-box">

                    <h3>
                        المصوتون
                    </h3>

                    <p style="
                        color:#806f5b;
                        font-size:12px;
                        line-height:1.8;
                    ">
                        تظهر هنا هوية من صوّت ووقت التصويت فقط.
                        لا يتم عرض اختيار الناخب للمرشحين.
                    </p>

                    ${
                        voters.length
                            ? `
                                <div class="table-wrap">

                                    <table>

                                        <thead>

                                            <tr>
                                                <th>UID</th>
                                                <th>الاسم</th>
                                                <th>وقت التصويت</th>
                                            </tr>

                                        </thead>

                                        <tbody>

                                            ${voters.map(
                                                voter =>
                                                    `
                                                    <tr>

                                                        <td>
                                                            ${escapeHtml(
                                                                voter.uid
                                                            )}
                                                        </td>

                                                        <td>
                                                            ${escapeHtml(
                                                                voter.nickname ||
                                                                "-"
                                                            )}
                                                        </td>

                                                        <td dir="ltr">
                                                            ${formatDate(
                                                                voter.created_at
                                                            )}
                                                        </td>

                                                    </tr>
                                                    `
                                            ).join("")}

                                        </tbody>

                                    </table>

                                </div>
                            `
                            : `
                                <div class="empty-state">
                                    لا يوجد مصوتون حتى الآن.
                                </div>
                            `
                    }

                </div>
            `;

            el("modalBody")
                .innerHTML =
                html;

        } catch (error) {

            console.error(error);

            el("modalBody")
                .innerHTML =
                `<div class="empty-state">حدث خطأ أثناء تحميل التفاصيل.</div>`;
        }
    };


el("closeModal")
    .addEventListener(
        "click",
        () => {
            el("electionModal")
                .classList.remove(
                    "active"
                );
        }
    );


el("electionModal")
    .addEventListener(
        "click",
        event => {

            if (
                event.target ===
                el("electionModal")
            ) {
                el("electionModal")
                    .classList.remove(
                        "active"
                    );
            }
        }
    );


/* =========================================================
   CREATE ELECTION
========================================================= */

el("createSeats")
    .addEventListener(
        "change",
        updateChoiceLimits
    );

function updateChoiceLimits() {

    const seats =
        Number(
            el("createSeats").value
        );

    el("createMaxChoices").max =
        String(seats);

    el("createMinChoices").max =
        String(seats);

    if (
        Number(
            el("createMinChoices").value
        ) > seats
    ) {
        el("createMinChoices").value =
            seats;
    }

    if (
        Number(
            el("createMaxChoices").value
        ) > seats
    ) {
        el("createMaxChoices").value =
            seats;
    }

    if (
        Number(
            el("createMaxChoices").value
        ) <
        Number(
            el("createMinChoices").value
        )
    ) {
        el("createMaxChoices").value =
            el("createMinChoices").value;
    }
}


el("createElectionForm")
    .addEventListener(
        "submit",
        async event => {

            event.preventDefault();

            hideMessage(
                el("createMessage")
            );


            const title =
                el("createTitle")
                    .value
                    .trim();

            const description =
                el("createDescription")
                    .value
                    .trim();

            const serverId =
                Number(
                    el("createServer")
                        .value
                );

            const seats =
                Number(
                    el("createSeats")
                        .value
                );

            const minChoices =
                Number(
                    el("createMinChoices")
                        .value
                );

            const maxChoices =
                Number(
                    el("createMaxChoices")
                        .value
                );

            const startInput =
                el("createStart")
                    .value;

            const endInput =
                el("createEnd")
                    .value;

            const showResults =
                el("createShowResults")
                    .checked;


            if (!title) {

                showMessage(
                    el("createMessage"),
                    "اكتب عنوان التصويت."
                );

                return;
            }

            if (!serverId) {

                showMessage(
                    el("createMessage"),
                    "اختر السيرفر."
                );

                return;
            }

            if (
                maxChoices <
                minChoices ||
                maxChoices >
                seats ||
                minChoices < 1
            ) {

                showMessage(
                    el("createMessage"),
                    `الاختيارات يجب أن تكون من 1 إلى ${seats}.`
                );

                return;
            }

            if (
                !startInput ||
                !endInput
            ) {

                showMessage(
                    el("createMessage"),
                    "حدد بداية ونهاية التصويت."
                );

                return;
            }


            const startAt =
                `${startInput}:00Z`;

            const endAt =
                `${endInput}:00Z`;


            if (
                Date.parse(startAt) >=
                Date.parse(endAt)
            ) {

                showMessage(
                    el("createMessage"),
                    "وقت البداية يجب أن يكون قبل وقت النهاية."
                );

                return;
            }


            el("createElectionButton")
                .disabled = true;

            el("createElectionButton")
                .textContent =
                "جاري الإنشاء...";


            try {

                const response =
                    await apiFetch(
                        "/admin/election/create",
                        {
                            method: "POST",

                            body:
                                JSON.stringify({
                                    title,
                                    description,
                                    server_id:
                                        serverId,
                                    seats,
                                    min_choices:
                                        minChoices,
                                    max_choices:
                                        maxChoices,
                                    start_at:
                                        startAt,
                                    end_at:
                                        endAt,
                                    show_results_during_voting:
                                        showResults
                                })
                        }
                    );


                const data =
                    await response.json();


                if (
                    !response.ok ||
                    !data.success
                ) {

                    showMessage(
                        el("createMessage"),
                        data.message ||
                        "تعذر إنشاء التصويت."
                    );

                    return;
                }


                showMessage(
                    el("createMessage"),

                    `تم إنشاء التصويت بنجاح.
رقم العملية: ${data.election.election_id}`,

                    "success"
                );


                el("createElectionForm")
                    .reset();

                el("createSeats")
                    .value = "5";

                el("createMinChoices")
                    .value = "1";

                el("createMaxChoices")
                    .value = "5";

                await loadElections(
                    currentFilter
                );

                await refreshDashboard();

            } catch (error) {

                console.error(error);

                showMessage(
                    el("createMessage"),
                    "حدث خطأ أثناء الاتصال بالخادم."
                );

            } finally {

                el("createElectionButton")
                    .disabled = false;

                el("createElectionButton")
                    .textContent =
                    "إنشاء عملية التصويت";
            }
        }
    );


/* =========================================================
   EDIT ELECTION
========================================================= */

window.editElection =
    async function(electionId) {

        const response =
            await apiFetch(
                `/admin/election/${encodeURIComponent(
                    electionId
                )}`
            );

        const data =
            await response.json();

        if (!response.ok) {
            alert(
                data.message ||
                "تعذر تحميل الانتخابات."
            );
            return;
        }

        const e =
            data.election;

        const title =
            prompt(
                "عنوان التصويت:",
                e.title
            );

        if (title === null) {
            return;
        }

        const description =
            prompt(
                "الوصف:",
                e.description || ""
            );

        if (description === null) {
            return;
        }

        let endAt =
            e.end_at;

        if (
            e.effective_status ===
            "open"
        ) {

            const newEnd =
                prompt(
                    "موعد النهاية بصيغة ISO UTC:",
                    e.end_at
                );

            if (newEnd === null) {
                return;
            }

            endAt = newEnd;

            try {

                const response2 =
                    await apiFetch(
                        `/admin/election/${encodeURIComponent(
                            electionId
                        )}`,
                        {
                            method: "PATCH",

                            body:
                                JSON.stringify({
                                    title,
                                    description,
                                    end_at:
                                        endAt
                                })
                        }
                    );

                const data2 =
                    await response2.json();

                if (
                    !response2.ok ||
                    !data2.success
                ) {
                    alert(
                        data2.message ||
                        "تعذر التعديل."
                    );
                    return;
                }

            } catch {

                alert(
                    "تعذر الاتصال بالخادم."
                );

                return;
            }

        } else {

            const newStart =
                prompt(
                    "البداية UTC:",
                    e.start_at
                );

            if (newStart === null) {
                return;
            }

            const newEnd =
                prompt(
                    "النهاية UTC:",
                    e.end_at
                );

            if (newEnd === null) {
                return;
            }

            const newMin =
                Number(
                    prompt(
                        "أقل عدد اختيارات:",
                        e.min_choices
                    )
                );

            const newMax =
                Number(
                    prompt(
                        "أقصى عدد اختيارات:",
                        e.max_choices
                    )
                );


            if (
                !Number.isInteger(
                    newMin
                ) ||
                !Number.isInteger(
                    newMax
                )
            ) {

                alert(
                    "قيم الاختيارات غير صحيحة."
                );

                return;
            }


            try {

                const response2 =
                    await apiFetch(
                        `/admin/election/${encodeURIComponent(
                            electionId
                        )}`,
                        {
                            method: "PATCH",

                            body:
                                JSON.stringify({
                                    title,
                                    description,
                                    min_choices:
                                        newMin,
                                    max_choices:
                                        newMax,
                                    start_at:
                                        newStart,
                                    end_at:
                                        newEnd
                                })
                        }
                    );

                const data2 =
                    await response2.json();

                if (
                    !response2.ok ||
                    !data2.success
                ) {

                    alert(
                        data2.message ||
                        "تعذر التعديل."
                    );

                    return;
                }

            } catch {

                alert(
                    "تعذر الاتصال بالخادم."
                );

                return;
            }
        }

        await loadElections(
            currentFilter
        );

        await refreshDashboard();
    };


/* =========================================================
   OPEN NOW
========================================================= */

window.openElectionNow =
    async function(electionId) {

        if (
            !confirm(
                "هل تريد فتح التصويت الآن؟"
            )
        ) {
            return;
        }

        try {

            const response =
                await apiFetch(
                    `/admin/election/${encodeURIComponent(
                        electionId
                    )}/open`,
                    {
                        method: "POST",
                        body: "{}"
                    }
                );

            const data =
                await response.json();

            if (
                !response.ok ||
                !data.success
            ) {

                alert(
                    data.message ||
                    "تعذر فتح التصويت."
                );

                return;
            }

            await loadElections(
                currentFilter
            );

            await refreshDashboard();

        } catch (error) {

            console.error(error);
        }
    };


/* =========================================================
   CLOSE
========================================================= */

window.closeElection =
    async function(electionId) {

        if (
            !confirm(
                "سيتم إنهاء التصويت نهائيًا. هل أنت متأكد؟"
            )
        ) {
            return;
        }

        try {

            const response =
                await apiFetch(
                    `/admin/election/${encodeURIComponent(
                        electionId
                    )}/close`,
                    {
                        method: "POST",
                        body: "{}"
                    }
                );

            const data =
                await response.json();

            if (
                !response.ok ||
                !data.success
            ) {

                alert(
                    data.message ||
                    "تعذر إنهاء التصويت."
                );

                return;
            }

            await loadElections(
                currentFilter
            );

            await refreshDashboard();

        } catch {}
    };


/* =========================================================
   CANCEL
========================================================= */

window.cancelElection =
    async function(electionId) {

        if (
            !confirm(
                "سيتم إلغاء عملية التصويت. لن يتم حذف السجل. هل أنت متأكد؟"
            )
        ) {
            return;
        }

        try {

            const response =
                await apiFetch(
                    `/admin/election/${encodeURIComponent(
                        electionId
                    )}/cancel`,
                    {
                        method: "POST",
                        body: "{}"
                    }
                );

            const data =
                await response.json();

            if (
                !response.ok ||
                !data.success
            ) {

                alert(
                    data.message ||
                    "تعذر إلغاء التصويت."
                );

                return;
            }

            await loadElections(
                currentFilter
            );

            await refreshDashboard();

        } catch {}
    };


/* =========================================================
   CANDIDATES
========================================================= */

window.addCandidate =
    async function(electionId) {

        const input =
            el("candidateUidInput");

        const uid =
            input.value.trim();

        if (!uid) {

            showMessage(
                el("candidateActionMessage"),
                "أدخل UID."
            );

            return;
        }

        try {

            const response =
                await apiFetch(
                    `/admin/election/${encodeURIComponent(
                        electionId
                    )}/candidates`,
                    {
                        method: "POST",
                        body:
                            JSON.stringify({
                                uid
                            })
                    }
                );

            const data =
                await response.json();

            if (
                !response.ok ||
                !data.success
            ) {

                showMessage(
                    el("candidateActionMessage"),
                    data.message ||
                    "تعذر إضافة المرشح."
                );

                return;
            }

            showMessage(
                el("candidateActionMessage"),
                "تمت إضافة المرشح.",
                "success"
            );

            input.value = "";

            await openElectionDetails(
                electionId
            );

        } catch {

            showMessage(
                el("candidateActionMessage"),
                "حدث خطأ أثناء الاتصال بالخادم."
            );
        }
    };


window.deleteCandidate =
    async function(
        electionId,
        candidateId
    ) {

        if (
            !confirm(
                "هل تريد حذف هذا المرشح؟"
            )
        ) {
            return;
        }

        try {

            const response =
                await apiFetch(
                    `/admin/election/${encodeURIComponent(
                        electionId
                    )}/candidates/${candidateId}`,
                    {
                        method: "DELETE"
                    }
                );

            const data =
                await response.json();

            if (
                !response.ok ||
                !data.success
            ) {

                alert(
                    data.message ||
                    "تعذر حذف المرشح."
                );

                return;
            }

            await openElectionDetails(
                electionId
            );

        } catch {}
    };


/* =========================================================
   PLAYERS
========================================================= */

el("validatePlayersButton")
    .addEventListener(
        "click",
        () => {

            showMessage(
                el("playersMessage"),
                "واجهة رفع اللاعبين جاهزة، لكن Endpoint فحص/استيراد الملفات لم يتم بناؤه في الـWorker بعد."
            );
        }
    );


/* =========================================================
   STARTUP
========================================================= */

updateChoiceLimits();
