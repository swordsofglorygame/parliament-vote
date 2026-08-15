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


function escapeHtml(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}


function showMessage(
    element,
    text,
    type = "error"
) {

    element.style.display = "block";
    element.textContent = text;

    if (type === "success") {

        element.style.background =
            "rgba(46,125,50,.15)";

        element.style.border =
            "1px solid rgba(76,175,80,.4)";

        element.style.color =
            "#9be7a0";

    } else {

        element.style.background =
            "rgba(198,40,40,.15)";

        element.style.border =
            "1px solid rgba(239,83,80,.4)";

        element.style.color =
            "#ff9d9d";
    }
}


function hideMessage(element) {

    element.style.display = "none";
    element.textContent = "";
}


function formatDate(value) {

    if (!value) {
        return "-";
    }

    const d =
        new Date(value);

    if (Number.isNaN(d.getTime())) {
        return value;
    }

    return d
        .toISOString()
        .replace("T", " ")
        .replace(".000Z", " UTC");
}


function statusText(status) {

    const names = {
        draft: "Draft",
        scheduled: "مجدولة",
        open: "جارية",
        closed: "منتهية",
        cancelled: "ملغاة"
    };

    return (
        names[status] ||
        status
    );
}


function statusBadge(status) {

    return `
        <span class="badge ${escapeHtml(status)}">
            ${escapeHtml(
                statusText(status)
            )}
        </span>
    `;
}


/* =========================================================
   API
========================================================= */

async function apiFetch(
    path,
    options = {}
) {

    options.headers = {
        ...(options.headers || {}),
        "Content-Type":
            "application/json"
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

        forceLogout(
            "انتهت جلسة الإدارة. يرجى تسجيل الدخول مرة أخرى."
        );

        throw new Error(
            "UNAUTHORIZED"
        );
    }


    return response;
}


/* =========================================================
   LOGOUT
========================================================= */

function forceLogout(
    message = ""
) {

    adminSessionToken =
        null;

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


/* =========================================================
   LOGIN
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
                "جاري تسجيل الدخول...";


            try {

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

                    showMessage(
                        el("loginMessage"),
                        data.message ||
                        "بيانات الدخول غير صحيحة."
                    );

                    return;
                }


                adminSessionToken =
                    data.token;


                el("adminEmailDisplay")
                    .textContent =
                    email;


                el("adminPassword")
                    .value = "";


                el("loginCard").style.display =
                    "none";

                el("dashboardCard").style.display =
                    "block";


                await refreshAll();

            } catch (error) {

                console.error(error);

                showMessage(
                    el("loginMessage"),
                    "حدث خطأ أثناء الاتصال بالخادم."
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
   LOGOUT BUTTON
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
                                Authorization:
                                    `Bearer ${adminSessionToken}`
                            }
                        }
                    );
                }

            } catch {}

            forceLogout();
        }
    );


/* =========================================================
   NAV
========================================================= */

document
    .querySelectorAll(
        ".nav button"
    )
    .forEach(button => {

        button.addEventListener(
            "click",
            async () => {

                document
                    .querySelectorAll(
                        ".nav button"
                    )
                    .forEach(
                        btn =>
                            btn.classList.remove(
                                "active"
                            )
                    );


                document
                    .querySelectorAll(
                        ".section"
                    )
                    .forEach(
                        section =>
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
                    "homeSection"
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

                    await loadServers();
                }


                if (
                    button.dataset.section ===
                    "serversSection"
                ) {
                    await loadServers();
                }


                if (
                    button.dataset.section ===
                    "playersSection"
                ) {
                    await loadServers();
                }
            }
        );
    });


/* =========================================================
   REFRESH ALL
========================================================= */

async function refreshAll() {

    await loadServers();

    await refreshDashboard();

    await loadElections(
        currentFilter
    );
}


/* =========================================================
   DASHBOARD
========================================================= */

async function refreshDashboard() {

    try {

        const statsResponse =
            await apiFetch(
                "/admin/stats"
            );

        const stats =
            await statsResponse.json();


        if (
            statsResponse.ok &&
            stats.success
        ) {

            el("statTotal")
                .textContent =
                stats.elections
                    ?.total_elections ??
                0;

            el("statActive")
                .textContent =
                stats.elections
                    ?.active_count ??
                0;

            el("statClosed")
                .textContent =
                stats.elections
                    ?.closed_count ??
                0;

            el("statVotes")
                .textContent =
                stats.total_votes ??
                0;
        }


        const response =
            await apiFetch(
                "/admin/elections?status=open"
            );

        const data =
            await response.json();


        if (
            !response.ok ||
            !data.success
        ) {
            return;
        }


        const list =
            data.elections || [];


        if (!list.length) {

            el("homeOpenList")
                .innerHTML = `
                    <div class="empty">
                        لا توجد عمليات تصويت جارية حاليًا.
                    </div>
                `;

            return;
        }


        el("homeOpenList")
            .innerHTML =
            list
                .map(
                    election =>
                        electionCard(
                            election
                        )
                )
                .join("");


    } catch (error) {

        console.error(
            "Dashboard error:",
            error
        );
    }
}


/* =========================================================
   ELECTION FILTER
========================================================= */

document
    .querySelectorAll(
        ".filter"
    )
    .forEach(button => {

        button.addEventListener(
            "click",
            async () => {

                document
                    .querySelectorAll(
                        ".filter"
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


/* =========================================================
   LOAD ELECTIONS
========================================================= */

async function loadElections(
    status = ""
) {

    el("electionsList")
        .innerHTML = `
            <div class="empty">
                جاري تحميل عمليات التصويت...
            </div>
        `;


    try {

        const query =
            status
                ? `?status=${encodeURIComponent(
                    status
                )}`
                : "";


        const response =
            await apiFetch(
                `/admin/elections${query}`
            );


        const data =
            await response.json();


        if (
            !response.ok ||
            !data.success
        ) {

            el("electionsList")
                .innerHTML = `
                    <div class="empty">
                        تعذر تحميل عمليات التصويت.
                    </div>
                `;

            return;
        }


        const elections =
            data.elections || [];


        if (!elections.length) {

            el("electionsList")
                .innerHTML = `
                    <div class="empty">
                        لا توجد عمليات تصويت هنا.
                    </div>
                `;

            return;
        }


        el("electionsList")
            .innerHTML =
            elections
                .map(
                    election =>
                        electionCard(
                            election
                        )
                )
                .join("");

    } catch (error) {

        console.error(error);

        el("electionsList")
            .innerHTML = `
                <div class="empty">
                    حدث خطأ أثناء تحميل البيانات.
                </div>
            `;
    }
}


/* =========================================================
   ELECTION CARD
========================================================= */

function electionCard(
    election
) {

    const status =
        election.effective_status ||
        election.status;


    return `
        <div class="election">

            <div class="election-head">

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

                ${statusBadge(status)}

            </div>


            <div class="meta">

                <div class="meta-box">

                    <div class="meta-label">
                        السيرفر
                    </div>

                    <div class="meta-value">
                        ${election.server_id}
                    </div>

                </div>


                <div class="meta-box">

                    <div class="meta-label">
                        المقاعد
                    </div>

                    <div class="meta-value">
                        ${election.seats}
                    </div>

                </div>


                <div class="meta-box">

                    <div class="meta-label">
                        المرشحون
                    </div>

                    <div class="meta-value">
                        ${
                            election.candidate_count ??
                            0
                        }
                    </div>

                </div>


                <div class="meta-box">

                    <div class="meta-label">
                        المصوتون
                    </div>

                    <div class="meta-value">
                        ${
                            election.voter_count ??
                            0
                        }
                    </div>

                </div>


                <div class="meta-box">

                    <div class="meta-label">
                        المؤهلون
                    </div>

                    <div class="meta-value">
                        ${
                            election.eligible_count ??
                            0
                        }
                    </div>

                </div>


                <div class="meta-box">

                    <div class="meta-label">
                        المشاركة
                    </div>

                    <div class="meta-value">
                        ${
                            election.participation_rate ??
                            0
                        }%
                    </div>

                </div>

            </div>


            <div style="
                color:#81735e;
                font-size:11px;
                line-height:1.8;
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


            <div class="actions">

                <button
                    class="btn-blue"
                    onclick="openDetails('${escapeHtml(
                        election.election_id
                    )}')"
                >
                    التفاصيل
                </button>


                ${
                    status === "draft" ||
                    status === "scheduled"
                        ? `
                            <button
                                class="btn-dark"
                                onclick="editElection('${escapeHtml(
                                    election.election_id
                                )}')"
                            >
                                تعديل
                            </button>

                            <button
                                class="btn-green"
                                onclick="openElection('${escapeHtml(
                                    election.election_id
                                )}')"
                            >
                                فتح الآن
                            </button>
                        `
                        : ""
                }


                ${
                    status === "open"
                        ? `
                            <button
                                class="btn-red"
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
                    status !== "closed" &&
                    status !== "cancelled"
                        ? `
                            <button
                                class="btn-red"
                                onclick="cancelElection('${escapeHtml(
                                    election.election_id
                                )}')"
                            >
                                إلغاء
                            </button>
                        `
                        : ""
                }


                ${
                    status === "cancelled"
                        ? `
                            <button
                                class="btn-red"
                                onclick="deleteCancelledElection('${escapeHtml(
                                    election.election_id
                                )}')"
                            >
                                حذف نهائي
                            </button>
                        `
                        : ""
                }

            </div>

        </div>
    `;
}


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


    el("createMinChoices").max =
        seats;

    el("createMaxChoices").max =
        seats;


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
}


function parseUtcInput(value) {

    const text =
        value
            .trim()
            .replace("T", " ");


    if (
        !/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(
            text
        )
    ) {
        return null;
    }


    return text.replace(
        " ",
        "T"
    ) + ":00Z";
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
                    el("createServer").value
                );


            const seats =
                Number(
                    el("createSeats").value
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


            const startAt =
                parseUtcInput(
                    el("createStart")
                        .value
                );


            const endAt =
                parseUtcInput(
                    el("createEnd")
                        .value
                );


            const showResults =
                el("createShowResults")
                    .checked;


            if (!title) {

                showMessage(
                    el("createMessage"),
                    "عنوان التصويت مطلوب."
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
                minChoices < 1 ||
                maxChoices <
                    minChoices ||
                maxChoices >
                    seats
            ) {

                showMessage(
                    el("createMessage"),
                    `الاختيارات يجب أن تكون من 1 إلى ${seats}.`
                );

                return;
            }


            if (!startAt || !endAt) {

                showMessage(
                    el("createMessage"),
                    "استخدم الصيغة YYYY-MM-DD HH:mm بالتوقيت UTC."
                );

                return;
            }


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
   LOAD SERVERS
========================================================= */

async function loadServers() {

    try {

        const response =
            await apiFetch(
                "/admin/servers"
            );


        const data =
            await response.json();


        if (
            !response.ok ||
            !data.success
        ) {
            return;
        }


        const activeServers =
            data.servers || [];


        const createServer =
            el("createServer");


        const playersServer =
            el("playersServer");


        const options =
            activeServers
                .filter(
                    server =>
                        Number(
                            server.active
                        ) === 1
                )
                .map(
                    server => `
                        <option
                            value="${server.server_id}"
                        >
                            ${escapeHtml(
                                server.name
                            )}
                        </option>
                    `
                )
                .join("");


        createServer.innerHTML = `
            <option value="">
                اختر السيرفر
            </option>
            ${options}
        `;


        playersServer.innerHTML =
            options || `
                <option value="">
                    لا توجد سيرفرات نشطة
                </option>
            `;


        renderServers(
            data.servers || []
        );

    } catch (error) {

        console.error(
            "Servers error:",
            error
        );
    }
}


/* =========================================================
   SERVERS LIST
========================================================= */

function renderServers(
    servers
) {

    const container =
        el("serversList");


    if (!servers.length) {

        container.innerHTML = `
            <div class="empty">
                لا توجد سيرفرات.
            </div>
        `;

        return;
    }


    container.innerHTML =
        servers
            .map(
                server =>
                    `
                    <div class="server-row">

                        <div>

                            <div class="server-name">
                                ${escapeHtml(
                                    server.name
                                )}
                            </div>

                            <div class="server-id">
                                Server ID:
                                ${server.server_id}
                            </div>

                        </div>

                        <div class="server-actions">

                            <button
                                class="btn-dark"
                                onclick="renameServer(
                                    ${server.server_id},
                                    '${escapeHtml(
                                        server.name
                                    )}'
                                )"
                            >
                                تعديل
                            </button>

                            <button
                                class="${
                                    Number(
                                        server.active
                                    ) === 1
                                        ? "btn-red"
                                        : "btn-green"
                                }"
                                onclick="toggleServer(
                                    ${server.server_id},
                                    ${Number(
                                        server.active
                                    )}
                                )"
                            >
                                ${
                                    Number(
                                        server.active
                                    ) === 1
                                        ? "تعطيل"
                                        : "تفعيل"
                                }
                            </button>

                        </div>

                    </div>
                    `
            )
            .join("");
}


/* =========================================================
   ADD SERVER
========================================================= */

el("serverForm")
    .addEventListener(
        "submit",
        async event => {

            event.preventDefault();

            hideMessage(
                el("serverMessage")
            );


            const serverId =
                Number(
                    el("serverIdInput")
                        .value
                );


            const name =
                el("serverNameInput")
                    .value
                    .trim();


            if (
                !Number.isInteger(
                    serverId
                ) ||
                serverId <= 0
            ) {

                showMessage(
                    el("serverMessage"),
                    "رقم السيرفر غير صحيح."
                );

                return;
            }


            if (!name) {

                showMessage(
                    el("serverMessage"),
                    "اسم السيرفر مطلوب."
                );

                return;
            }


            try {

                const response =
                    await apiFetch(
                        "/admin/servers",
                        {
                            method: "POST",

                            body:
                                JSON.stringify({
                                    server_id:
                                        serverId,
                                    name
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
                        el("serverMessage"),
                        data.message ||
                        "تعذر إضافة السيرفر."
                    );

                    return;
                }


                showMessage(
                    el("serverMessage"),
                    "تمت إضافة السيرفر بنجاح.",
                    "success"
                );


                el("serverForm")
                    .reset();


                await loadServers();

            } catch (error) {

                console.error(error);

                showMessage(
                    el("serverMessage"),
                    "حدث خطأ أثناء الاتصال بالخادم."
                );
            }
        }
    );


/* =========================================================
   RENAME SERVER
========================================================= */

window.renameServer =
    async function(
        serverId,
        oldName
    ) {

        const name =
            prompt(
                "اسم السيرفر الجديد:",
                oldName
            );


        if (
            name === null ||
            !name.trim()
        ) {
            return;
        }


        try {

            const response =
                await apiFetch(
                    `/admin/servers/${serverId}`,
                    {
                        method: "PATCH",

                        body:
                            JSON.stringify({
                                name:
                                    name.trim()
                            })
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
                    "تعذر تعديل السيرفر."
                );

                return;
            }


            await loadServers();

        } catch {

            alert(
                "تعذر الاتصال بالخادم."
            );
        }
    };


/* =========================================================
   TOGGLE SERVER
========================================================= */

window.toggleServer =
    async function(
        serverId,
        active
    ) {

        const enable =
            Number(active) !== 1;


        if (
            !confirm(
                enable
                    ? "تفعيل هذا السيرفر؟"
                    : "تعطيل هذا السيرفر؟"
            )
        ) {
            return;
        }


        try {

            const response =
                await apiFetch(
                    `/admin/servers/${serverId}`,
                    {
                        method: "PATCH",

                        body:
                            JSON.stringify({
                                active:
                                    enable
                            })
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
                    "تعذر تحديث السيرفر."
                );

                return;
            }


            await loadServers();

        } catch {

            alert(
                "تعذر الاتصال بالخادم."
            );
        }
    };


/* =========================================================
   OPEN ELECTION
========================================================= */

window.openElection =
    async function(
        electionId
    ) {

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

        } catch {

            alert(
                "حدث خطأ أثناء فتح التصويت."
            );
        }
    };


/* =========================================================
   CLOSE ELECTION
========================================================= */

window.closeElection =
    async function(
        electionId
    ) {

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

        } catch {

            alert(
                "حدث خطأ أثناء إنهاء التصويت."
            );
        }
    };


/* =========================================================
   CANCEL ELECTION
========================================================= */

window.cancelElection =
    async function(
        electionId
    ) {

        if (
            !confirm(
                "سيتم إلغاء عملية التصويت. لن يتم حذفها. هل أنت متأكد؟"
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

        } catch {

            alert(
                "حدث خطأ أثناء إلغاء التصويت."
            );
        }
    };


/* =========================================================
   DELETE CANCELLED ELECTION
========================================================= */

window.deleteCancelledElection =
    async function(
        electionId
    ) {

        const confirmed =
            confirm(
                "تحذير:\n\nسيتم حذف عملية التصويت الملغاة نهائيًا.\n\nلا يمكن التراجع عن هذا الإجراء.\n\nهل تريد المتابعة؟"
            );


        if (!confirmed) {
            return;
        }


        try {

            const response =
                await apiFetch(
                    `/admin/election/${encodeURIComponent(
                        electionId
                    )}`,
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
                    "تعذر حذف التصويت."
                );

                return;
            }


            await loadElections(
                currentFilter
            );

            await refreshDashboard();

        } catch {

            alert(
                "حدث خطأ أثناء حذف التصويت."
            );
        }
    };


/* =========================================================
   EDIT ELECTION
========================================================= */

window.editElection =
    async function(
        electionId
    ) {

        try {

            const response =
                await apiFetch(
                    `/admin/election/${encodeURIComponent(
                        electionId
                    )}`
                );


            const data =
                await response.json();


            if (
                !response.ok ||
                !data.success
            ) {

                alert(
                    data.message ||
                    "تعذر تحميل الانتخابات."
                );

                return;
            }


            const election =
                data.election;


            const title =
                prompt(
                    "عنوان التصويت:",
                    election.title
                );


            if (title === null) {
                return;
            }


            const description =
                prompt(
                    "الوصف:",
                    election.description ||
                    ""
                );


            if (description === null) {
                return;
            }


            const endAt =
                prompt(
                    "النهاية بصيغة UTC:\nYYYY-MM-DDTHH:mm:ssZ",
                    election.end_at
                );


            if (endAt === null) {
                return;
            }


            const response2 =
                await apiFetch(
                    `/admin/election/${encodeURIComponent(
                        electionId
                    )}`,
                    {
                        method: "PATCH",

                        body:
                            JSON.stringify({
                                title:
                                    title.trim(),
                                description:
                                    description.trim(),
                                end_at:
                                    endAt.trim()
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
                    "تعذر تعديل التصويت."
                );

                return;
            }


            await loadElections(
                currentFilter
            );

            await refreshDashboard();

        } catch {

            alert(
                "حدث خطأ أثناء تعديل التصويت."
            );
        }
    };


/* =========================================================
   DETAILS
========================================================= */

window.openDetails =
    async function(
        electionId
    ) {

        currentElectionId =
            electionId;


        el("electionModal")
            .classList.add("show");


        el("modalBody")
            .innerHTML = `
                <div class="empty">
                    جاري تحميل التفاصيل...
                </div>
            `;


        try {

            const detailsResponse =
                await apiFetch(
                    `/admin/election/${encodeURIComponent(
                        electionId
                    )}`
                );


            const details =
                await detailsResponse.json();


            if (
                !detailsResponse.ok ||
                !details.success
            ) {

                el("modalBody")
                    .innerHTML = `
                        <div class="empty">
                            تعذر تحميل التفاصيل.
                        </div>
                    `;

                return;
            }


            const votersResponse =
                await apiFetch(
                    `/admin/election/${encodeURIComponent(
                        electionId
                    )}/voters?limit=5000`
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


            const election =
                details.election;


            const candidates =
                details.candidates ||
                [];


            const voters =
                votersData.voters ||
                [];


            const results =
                resultsData.results ||
                [];


            el("modalTitle")
                .textContent =
                election.title;


            el("modalElectionId")
                .textContent =
                election.election_id;


            let html = `

                <div class="grid-3">

                    <div class="meta-box">
                        <div class="meta-label">
                            الحالة
                        </div>
                        <div class="meta-value">
                            ${statusBadge(
                                election.effective_status
                            )}
                        </div>
                    </div>

                    <div class="meta-box">
                        <div class="meta-label">
                            السيرفر
                        </div>
                        <div class="meta-value">
                            ${election.server_id}
                        </div>
                    </div>

                    <div class="meta-box">
                        <div class="meta-label">
                            المقاعد
                        </div>
                        <div class="meta-value">
                            ${election.seats}
                        </div>
                    </div>

                    <div class="meta-box">
                        <div class="meta-label">
                            المرشحون
                        </div>
                        <div class="meta-value">
                            ${election.candidate_count}
                        </div>
                    </div>

                    <div class="meta-box">
                        <div class="meta-label">
                            المصوتون
                        </div>
                        <div class="meta-value">
                            ${election.voter_count}
                        </div>
                    </div>

                    <div class="meta-box">
                        <div class="meta-label">
                            المشاركة
                        </div>
                        <div class="meta-value">
                            ${election.participation_rate}%
                        </div>
                    </div>

                </div>


                <div class="box">

                    <h3 class="box-title">
                        المرشحون
                    </h3>

                    ${
                        candidates.length
                            ? candidates
                                .map(
                                    candidate =>
                                        `
                                        <div class="candidate">

                                            <div>

                                                <div class="candidate-name">
                                                    ${escapeHtml(
                                                        candidate.nickname
                                                    )}
                                                </div>

                                                <div class="candidate-uid">
                                                    UID:
                                                    ${escapeHtml(
                                                        candidate.uid
                                                    )}
                                                </div>

                                            </div>

                                            ${
                                                election.effective_status === "draft" ||
                                                election.effective_status === "scheduled"
                                                    ? `
                                                        <button
                                                            onclick="deleteCandidate(
                                                                '${escapeHtml(
                                                                    election.election_id
                                                                )}',
                                                                ${candidate.candidate_id}
                                                            )"
                                                        >
                                                            حذف
                                                        </button>
                                                    `
                                                    : ""
                                            }

                                        </div>
                                        `
                                )
                                .join("")
                            : `
                                <div class="empty">
                                    لا يوجد مرشحون.
                                </div>
                            `
                    }


                    ${
                        election.effective_status === "draft" ||
                        election.effective_status === "scheduled"
                            ? `
                                <div
                                    style="
                                        margin-top:18px;
                                    "
                                >

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
                                        class="btn-green"
                                        onclick="addCandidate(
                                            '${escapeHtml(
                                                election.election_id
                                            )}'
                                        )"
                                    >
                                        إضافة المرشح
                                    </button>

                                    <div
                                        class="message"
                                        id="candidateMessage"
                                    ></div>

                                </div>
                            `
                            : ""
                    }

                </div>


                <div class="box">

                    <h3 class="box-title">
                        النتائج
                    </h3>


                    <div class="stats">

                        <div class="stat">

                            <div class="stat-label">
                                المصوتون
                            </div>

                            <div class="stat-value">
                                ${
                                    resultsData.stats
                                        ?.voters ??
                                    0
                                }
                            </div>

                        </div>


                        <div class="stat">

                            <div class="stat-label">
                                المؤهلون
                            </div>

                            <div class="stat-value">
                                ${
                                    resultsData.stats
                                        ?.eligible ??
                                    0
                                }
                            </div>

                        </div>


                        <div class="stat">

                            <div class="stat-label">
                                المشاركة
                            </div>

                            <div class="stat-value">
                                ${
                                    resultsData.stats
                                        ?.participation_rate ??
                                    0
                                }%
                            </div>

                        </div>


                        <div class="stat">

                            <div class="stat-label">
                                المقاعد
                            </div>

                            <div class="stat-value">
                                ${
                                    election.seats
                                }
                            </div>

                        </div>

                    </div>


                    ${
                        results.length
                            ? results
                                .map(
                                    row =>
                                        `
                                        <div class="result">

                                            <div class="result-top">

                                                <span>
                                                    ${escapeHtml(
                                                        row.nickname
                                                    )}
                                                </span>

                                                <span>
                                                    ${row.votes}
                                                    صوت
                                                    —
                                                    ${row.percentage}%
                                                </span>

                                            </div>


                                            <div class="bar">

                                                <div
                                                    class="bar-fill"
                                                    style="
                                                        width:${Math.min(
                                                            Number(
                                                                row.percentage
                                                            ),
                                                            100
                                                        )}%;
                                                    "
                                                ></div>

                                            </div>

                                        </div>
                                        `
                                )
                                .join("")
                            : `
                                <div class="empty">
                                    لا توجد أصوات حتى الآن.
                                </div>
                            `
                    }

                </div>


                <div class="box">

                    <h3 class="box-title">
                        المصوتون
                    </h3>

                    <p
                        style="
                            color:#806f5b;
                            font-size:12px;
                            line-height:1.8;
                        "
                    >
                        يظهر من قام بالتصويت ووقت تصويته فقط.
                        لا يتم كشف المرشح الذي اختاره الناخب.
                    </p>


                    ${
                        voters.length
                            ? `
                                <div class="table-wrap">

                                    <table>

                                        <thead>

                                            <tr>

                                                <th>
                                                    UID
                                                </th>

                                                <th>
                                                    الاسم
                                                </th>

                                                <th>
                                                    وقت التصويت
                                                </th>

                                            </tr>

                                        </thead>

                                        <tbody>

                                            ${voters
                                                .map(
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
                                                )
                                                .join("")}

                                        </tbody>

                                    </table>

                                </div>
                            `
                            : `
                                <div class="empty">
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
                .innerHTML = `
                    <div class="empty">
                        حدث خطأ أثناء تحميل التفاصيل.
                    </div>
                `;
        }
    };


/* =========================================================
   CLOSE MODAL
========================================================= */

el("closeModal")
    .addEventListener(
        "click",
        () => {

            el("electionModal")
                .classList.remove(
                    "show"
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
                        "show"
                    );
            }
        }
    );


/* =========================================================
   ADD CANDIDATE
========================================================= */

window.addCandidate =
    async function(
        electionId
    ) {

        const input =
            el("candidateUidInput");


        const uid =
            input.value.trim();


        if (!uid) {

            showMessage(
                el("candidateMessage"),
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
                    el("candidateMessage"),
                    data.message ||
                    "تعذر إضافة المرشح."
                );

                return;
            }


            input.value = "";


            await openDetails(
                electionId
            );

        } catch {

            showMessage(
                el("candidateMessage"),
                "حدث خطأ أثناء إضافة المرشح."
            );
        }
    };


/* =========================================================
   DELETE CANDIDATE
========================================================= */

window.deleteCandidate =
    async function(
        electionId,
        candidateId
    ) {

        if (
            !confirm(
                "حذف هذا المرشح؟"
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


            await openDetails(
                electionId
            );


        } catch {

            alert(
                "تعذر الاتصال بالخادم."
            );
        }
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
                "رفع ملفات اللاعبين لم يتم ربطه بالـAPI بعد."
            );
        }
    );


/* =========================================================
   INITIAL
========================================================= */

updateChoiceLimits();
