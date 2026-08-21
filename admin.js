const API_URL =
    "https://parliament-api.sog-parliament.workers.dev";

let adminSessionToken =
    localStorage.getItem("admin_session_token") || null;

let adminEmail =
    localStorage.getItem("admin_email") || "";

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

function showMessage(element, text, type = "error") {
    if (!element) return;

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
    if (!element) return;

    element.style.display = "none";
    element.textContent = "";
}

function formatDate(value) {
    if (!value) return "-";

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return String(value);
    }

    return date
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

    return names[status] || status;
}

function statusBadge(status) {
    return `
        <span class="badge ${escapeHtml(status)}">
            ${escapeHtml(statusText(status))}
        </span>
    `;
}

function parseUtcDateTime(value) {
    if (!value) return null;

    /*
     * datetime-local يعطينا:
     * 2026-08-25T21:30
     *
     * ونحن نعاملها صراحة على أنها UTC.
     */
    const iso = `${value}:00Z`;

    const timestamp = Date.parse(iso);

    if (Number.isNaN(timestamp)) {
        return null;
    }

    return iso;
}

function normalizeCandidateNames(text) {
    return [
        ...new Set(
            String(text || "")
                .split(/\r?\n/)
                .map(name => name.trim())
                .filter(Boolean)
        )
    ];
}


/* =========================================================
   API
========================================================= */

async function apiFetch(path, options = {}) {
    options.headers = {
        ...(options.headers || {}),
        "Content-Type": "application/json"
    };

    if (adminSessionToken) {
        options.headers.Authorization =
            `Bearer ${adminSessionToken}`;
    }

    const response = await fetch(
        `${API_URL}${path}`,
        options
    );

    if (response.status === 401) {
        forceLogout(
            "انتهت جلسة الإدارة. يرجى تسجيل الدخول مرة أخرى."
        );

        throw new Error("UNAUTHORIZED");
    }

    return response;
}


/* =========================================================
   AUTH / LOGOUT
========================================================= */

function forceLogout(message = "") {
    adminSessionToken = null;
    adminEmail = "";

    localStorage.removeItem("admin_session_token");
    localStorage.removeItem("admin_email");

    const dashboardCard = el("dashboardCard");
    const loginCard = el("loginCard");

    if (dashboardCard) {
        dashboardCard.style.display = "none";
    }

    if (loginCard) {
        loginCard.style.display = "block";
    }

    if (message) {
        showMessage(
            el("loginMessage"),
            message
        );
    }
}


el("loginForm")?.addEventListener(
    "submit",
    async event => {

        event.preventDefault();

        hideMessage(
            el("loginMessage")
        );

        const email =
            el("adminEmail")?.value.trim();

        const password =
            el("adminPassword")?.value;

        if (!email || !password) {
            showMessage(
                el("loginMessage"),
                "البريد الإلكتروني وكلمة المرور مطلوبان."
            );
            return;
        }

        const button =
            el("loginButton");

        button.disabled = true;
        button.textContent =
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

            let data;

            try {
                data =
                    await response.json();
            } catch {
                throw new Error(
                    "الخادم أعاد استجابة غير صالحة."
                );
            }

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

            adminEmail =
                email;

            localStorage.setItem(
                "admin_session_token",
                adminSessionToken
            );

            localStorage.setItem(
                "admin_email",
                adminEmail
            );

            el("adminEmailDisplay")
                .textContent =
                adminEmail;

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
                error.message ||
                "حدث خطأ أثناء الاتصال بالخادم."
            );

        } finally {

            button.disabled = false;
            button.textContent =
                "تسجيل الدخول";
        }
    }
);


el("logoutButton")?.addEventListener(
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

        } catch (error) {
            console.error(error);
        }

        forceLogout();
    }
);


/* =========================================================
   NAVIGATION
========================================================= */

document
    .querySelectorAll(".nav button")
    .forEach(button => {

        button.addEventListener(
            "click",
            async () => {

                document
                    .querySelectorAll(".nav button")
                    .forEach(btn => {
                        btn.classList.remove("active");
                    });

                document
                    .querySelectorAll(".section")
                    .forEach(section => {
                        section.classList.remove("active");
                    });

                button.classList.add("active");

                const section =
                    el(button.dataset.section);

                if (section) {
                    section.classList.add("active");
                }

                switch (
                    button.dataset.section
                ) {

                    case "homeSection":
                        await refreshDashboard();
                        break;

                    case "electionsSection":
                        await loadServers();
                        await loadElections(
                            currentFilter
                        );
                        break;

                    case "serversSection":
                        await loadServers();
                        break;

                    case "playersSection":
                        await loadServers();
                        break;
                }
            }
        );
    });


/* =========================================================
   REFRESH
========================================================= */

async function refreshAll() {
    await loadServers();
    await refreshDashboard();
    await loadElections(currentFilter);
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

            el("statTotal").textContent =
                stats.elections?.total_elections ??
                0;

            el("statActive").textContent =
                stats.elections?.active_count ??
                0;

            el("statClosed").textContent =
                stats.elections?.closed_count ??
                0;

            el("statVotes").textContent =
                stats.total_votes ??
                0;
        }


        const openResponse =
            await apiFetch(
                "/admin/elections?status=open"
            );

        const openData =
            await openResponse.json();

        if (
            !openResponse.ok ||
            !openData.success
        ) {
            return;
        }

        const elections =
            openData.elections || [];

        if (!elections.length) {

            el("homeOpenList").innerHTML = `
                <div class="empty">
                    لا توجد عمليات تصويت جارية حاليًا.
                </div>
            `;

            return;
        }

        el("homeOpenList").innerHTML =
            elections
                .map(election =>
                    electionCard(election)
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
   FILTERS
========================================================= */

document
    .querySelectorAll(".filter")
    .forEach(button => {

        button.addEventListener(
            "click",
            async () => {

                document
                    .querySelectorAll(".filter")
                    .forEach(btn => {
                        btn.classList.remove(
                            "active"
                        );
                    });

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

    const container =
        el("electionsList");

    if (!container) return;

    container.innerHTML = `
        <div class="empty">
            جاري تحميل عمليات التصويت...
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

        if (
            !response.ok ||
            !data.success
        ) {

            container.innerHTML = `
                <div class="empty">
                    تعذر تحميل عمليات التصويت.
                </div>
            `;

            return;
        }

        const elections =
            data.elections || [];

        if (!elections.length) {

            container.innerHTML = `
                <div class="empty">
                    لا توجد عمليات تصويت في هذا القسم.
                </div>
            `;

            return;
        }

        container.innerHTML =
            elections
                .map(election =>
                    electionCard(election)
                )
                .join("");

    } catch (error) {

        console.error(error);

        container.innerHTML = `
            <div class="empty">
                حدث خطأ أثناء تحميل البيانات.
            </div>
        `;
    }
}


/* =========================================================
   ELECTION CARD
========================================================= */

function electionCard(election) {

    const status =
        election.effective_status ||
        election.status;

    return `
        <div class="election">

            <div class="e-head">

                <div>

                    <div class="e-title">
                        ${escapeHtml(
                            election.title
                        )}
                    </div>

                    <div class="e-id">
                        ${escapeHtml(
                            election.election_id
                        )}
                    </div>

                </div>

                ${statusBadge(status)}

            </div>


            <div class="meta">

                <div class="meta-box">
                    <div class="ml">
                        السيرفر
                    </div>
                    <div class="mv">
                        ${escapeHtml(
                            election.server_id
                        )}
                    </div>
                </div>

                <div class="meta-box">
                    <div class="ml">
                        المقاعد
                    </div>
                    <div class="mv">
                        ${escapeHtml(
                            election.seats
                        )}
                    </div>
                </div>

                <div class="meta-box">
                    <div class="ml">
                        المرشحون
                    </div>
                    <div class="mv">
                        ${
                            election.candidate_count ??
                            0
                        }
                    </div>
                </div>

                <div class="meta-box">
                    <div class="ml">
                        المصوتون
                    </div>
                    <div class="mv">
                        ${
                            election.voter_count ??
                            0
                        }
                    </div>
                </div>

                <div class="meta-box">
                    <div class="ml">
                        المؤهلون
                    </div>
                    <div class="mv">
                        ${
                            election.eligible_count ??
                            0
                        }
                    </div>
                </div>

                <div class="meta-box">
                    <div class="ml">
                        المشاركة
                    </div>
                    <div class="mv">
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
                    class="blue"
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
                                class="dark"
                                onclick="editElection('${escapeHtml(
                                    election.election_id
                                )}')"
                            >
                                تعديل
                            </button>

                            <button
                                class="green"
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
                                class="red"
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
                                class="red"
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
                                class="red"
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

el("createSeats")?.addEventListener(
    "input",
    updateChoiceLimits
);

el("createMinChoices")?.addEventListener(
    "input",
    updateChoiceLimits
);

el("createMaxChoices")?.addEventListener(
    "input",
    updateChoiceLimits
);


function updateChoiceLimits() {

    const seats =
        Number(
            el("createSeats")?.value
        ) || 1;

    const minInput =
        el("createMinChoices");

    const maxInput =
        el("createMaxChoices");

    if (!minInput || !maxInput) {
        return;
    }

    minInput.max =
        String(seats);

    maxInput.max =
        String(seats);

    let minValue =
        Number(minInput.value) || 1;

    let maxValue =
        Number(maxInput.value) || seats;

    if (minValue > seats) {
        minValue = seats;
        minInput.value = seats;
    }

    if (maxValue > seats) {
        maxValue = seats;
        maxInput.value = seats;
    }

    if (maxValue < minValue) {
        maxInput.value =
            String(minValue);
    }
}


el("createElectionForm")
    ?.addEventListener(
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


            const candidateNames =
                normalizeCandidateNames(
                    el("candidateNames")
                        ?.value
                );


            const startAt =
                parseUtcDateTime(
                    el("createStart")
                        .value
                );


            const endAt =
                parseUtcDateTime(
                    el("createEnd")
                        .value
                );


            const showResults =
                Boolean(
                    el("createShowResults")
                        .checked
                );


            if (!title) {
                showMessage(
                    el("createMessage"),
                    "عنوان التصويت مطلوب."
                );
                return;
            }


            if (
                !Number.isInteger(serverId) ||
                serverId <= 0
            ) {
                showMessage(
                    el("createMessage"),
                    "اختر السيرفر."
                );
                return;
            }


            if (
                !Number.isInteger(seats) ||
                seats < 1 ||
                seats > 100
            ) {
                showMessage(
                    el("createMessage"),
                    "عدد المقاعد يجب أن يكون من 1 إلى 100."
                );
                return;
            }


            if (
                minChoices < 1 ||
                maxChoices < minChoices ||
                maxChoices > seats
            ) {
                showMessage(
                    el("createMessage"),
                    `الاختيارات يجب أن تكون من 1 إلى ${seats}.`
                );
                return;
            }


            if (!candidateNames.length) {
                showMessage(
                    el("createMessage"),
                    "أدخل أسماء المرشحين، اسم واحد في كل سطر."
                );
                return;
            }


            if (
                candidateNames.length <
                seats
            ) {
                showMessage(
                    el("createMessage"),
                    `عدد المرشحين (${candidateNames.length}) أقل من عدد المقاعد (${seats}).`
                );
                return;
            }


            if (!startAt || !endAt) {
                showMessage(
                    el("createMessage"),
                    "اختر تاريخ ووقت البداية والنهاية."
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


            const button =
                el("createElectionButton");

            button.disabled = true;
            button.textContent =
                "جاري إنشاء التصويت...";


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
                                        showResults,

                                    candidate_names:
                                        candidateNames
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
رقم العملية: ${data.election.election_id}
عدد المرشحين: ${candidateNames.length}`,

                    "success"
                );


                const serverValue =
                    el("createServer")
                        .value;


                el("createElectionForm")
                    .reset();


                el("createServer")
                    .value =
                    serverValue;


                el("createSeats")
                    .value =
                    "5";


                el("createMinChoices")
                    .value =
                    "1";


                el("createMaxChoices")
                    .value =
                    "5";


                updateChoiceLimits();


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

                button.disabled = false;

                button.textContent =
                    "إنشاء عملية التصويت";
            }
        }
    );


/* =========================================================
   SERVERS
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


        const servers =
            data.servers || [];


        const createSelect =
            el("createServer");

        const playersSelect =
            el("playersServer");


        const activeOptions =
            servers
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
                            data-seats="${
                                Number(
                                    server.seats
                                ) || 5
                            }"
                        >
                            ${escapeHtml(
                                server.name
                            )}
                        </option>
                    `
                )
                .join("");


        createSelect.innerHTML = `
            <option value="">
                اختر السيرفر
            </option>
            ${activeOptions}
        `;


        playersSelect.innerHTML =
            activeOptions ||
            `
                <option value="">
                    لا توجد سيرفرات نشطة
                </option>
            `;


        renderServers(
            servers
        );

    } catch (error) {

        console.error(
            "loadServers:",
            error
        );
    }
}


/*
 * لما نغير السيرفر:
 * نجيب عدد المقاعد الافتراضي ونضعه تلقائيًا.
 */

el("createServer")
    ?.addEventListener(
        "change",
        () => {

            const option =
                el("createServer")
                    .selectedOptions[0];

            if (!option) return;

            const defaultSeats =
                Number(
                    option.dataset.seats
                );

            if (
                Number.isInteger(
                    defaultSeats
                ) &&
                defaultSeats >= 1
            ) {

                el("createSeats")
                    .value =
                    String(
                        Math.min(
                            defaultSeats,
                            100
                        )
                    );

                el("createMaxChoices")
                    .value =
                    String(
                        Math.min(
                            defaultSeats,
                            100
                        )
                    );

                updateChoiceLimits();
            }
        }
    );


function renderServers(servers) {

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
                server => {

                    const active =
                        Number(
                            server.active
                        ) === 1;

                    const seats =
                        Number(
                            server.seats
                        ) || 0;

                    return `
                        <div class="server-row">

                            <div>

                                <div class="server-name">
                                    ${escapeHtml(
                                        server.name
                                    )}
                                </div>

                                <div class="server-sub">
                                    Server ${server.server_id}
                                    —
                                    ${seats} مقاعد
                                    —
                                    ${
                                        active
                                            ? "نشط"
                                            : "معطل"
                                    }
                                </div>

                            </div>


                            <div class="server-actions">

                                <button
                                    class="dark"
                                    onclick="editServer(
                                        ${server.server_id},
                                        '${escapeHtml(
                                            server.name
                                        )}',
                                        ${seats}
                                    )"
                                >
                                    تعديل
                                </button>


                                <button
                                    class="${
                                        active
                                            ? "red"
                                            : "green"
                                    }"
                                    onclick="toggleServer(
                                        ${server.server_id},
                                        ${active}
                                    )"
                                >
                                    ${
                                        active
                                            ? "تعطيل"
                                            : "تفعيل"
                                    }
                                </button>

                            </div>

                        </div>
                    `;
                }
            )
            .join("");
}


/* =========================================================
   ADD SERVER
========================================================= */

el("serverForm")
    ?.addEventListener(
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


            const seats =
                Number(
                    el("serverSeatsInput")
                        .value
                );


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


            if (
                !Number.isInteger(
                    seats
                ) ||
                seats < 1 ||
                seats > 100
            ) {

                showMessage(
                    el("serverMessage"),
                    "عدد المقاعد يجب أن يكون من 1 إلى 100."
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

                                    name,

                                    seats
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


                el("serverSeatsInput")
                    .value =
                    "5";


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
   EDIT SERVER
========================================================= */

window.editServer =
    async function(
        serverId,
        oldName,
        oldSeats
    ) {

        const name =
            prompt(
                "اسم السيرفر:",
                oldName
            );

        if (name === null) {
            return;
        }


        const seatsInput =
            prompt(
                "عدد المقاعد الافتراضي:",
                String(oldSeats)
            );

        if (seatsInput === null) {
            return;
        }


        const seats =
            Number(seatsInput);


        if (
            !Number.isInteger(seats) ||
            seats < 1 ||
            seats > 100
        ) {

            alert(
                "عدد المقاعد يجب أن يكون من 1 إلى 100."
            );

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
                                    name.trim(),

                                seats
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
        currentlyActive
    ) {

        const nextState =
            !currentlyActive;


        const message =
            nextState
                ? "تفعيل هذا السيرفر؟"
                : "تعطيل هذا السيرفر؟";


        if (!confirm(message)) {
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
                                    nextState
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
                "سيتم إلغاء عملية التصويت ولن يتم حذفها. هل أنت متأكد؟"
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
                "تحذير:\n\nسيتم حذف التصويت الملغى نهائيًا.\nلا يمكن التراجع عن هذا الإجراء.\n\nهل تريد المتابعة؟"
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
                    "تعذر تحميل التصويت."
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


            const newEnd =
                prompt(
                    "وقت النهاية UTC بصيغة:\n2026-08-25T21:00:00Z",
                    election.end_at
                );

            if (newEnd === null) {
                return;
            }


            const body = {
                title:
                    title.trim(),

                description:
                    description.trim(),

                end_at:
                    newEnd.trim()
            };


            /*
             * لو التصويت Draft/Scheduled:
             * نسمح أيضًا بتعديل البداية والمقاعد والاختيارات.
             */

            if (
                election.effective_status ===
                    "draft" ||
                election.effective_status ===
                    "scheduled"
            ) {

                const seats =
                    Number(
                        prompt(
                            "عدد المقاعد:",
                            election.seats
                        )
                    );

                const minChoices =
                    Number(
                        prompt(
                            "أقل عدد اختيارات:",
                            election.min_choices
                        )
                    );

                const maxChoices =
                    Number(
                        prompt(
                            "أقصى عدد اختيارات:",
                            election.max_choices
                        )
                    );

                if (
                    !Number.isInteger(
                        seats
                    ) ||
                    !Number.isInteger(
                        minChoices
                    ) ||
                    !Number.isInteger(
                        maxChoices
                    )
                ) {

                    alert(
                        "القيم غير صحيحة."
                    );

                    return;
                }

                body.seats =
                    seats;

                body.min_choices =
                    minChoices;

                body.max_choices =
                    maxChoices;
            }


            const updateResponse =
                await apiFetch(
                    `/admin/election/${encodeURIComponent(
                        electionId
                    )}`,
                    {
                        method: "PATCH",

                        body:
                            JSON.stringify(
                                body
                            )
                    }
                );


            const updateData =
                await updateResponse.json();


            if (
                !updateResponse.ok ||
                !updateData.success
            ) {

                alert(
                    updateData.message ||
                    "تعذر تعديل التصويت."
                );

                return;
            }


            await loadElections(
                currentFilter
            );

            await refreshDashboard();

        } catch (error) {

            console.error(error);

            alert(
                "حدث خطأ أثناء تعديل التصويت."
            );
        }
    };


/* =========================================================
   DETAILS MODAL
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
                details.candidates || [];

            const voters =
                votersData.voters || [];

            const results =
                resultsData.results || [];


            el("modalTitle")
                .textContent =
                election.title;

            el("modalElectionId")
                .textContent =
                election.election_id;


            let html = `

                <div class="grid3">

                    <div class="meta-box">
                        <div class="ml">
                            الحالة
                        </div>
                        <div class="mv">
                            ${statusBadge(
                                election.effective_status
                            )}
                        </div>
                    </div>

                    <div class="meta-box">
                        <div class="ml">
                            السيرفر
                        </div>
                        <div class="mv">
                            ${election.server_id}
                        </div>
                    </div>

                    <div class="meta-box">
                        <div class="ml">
                            المقاعد
                        </div>
                        <div class="mv">
                            ${election.seats}
                        </div>
                    </div>

                    <div class="meta-box">
                        <div class="ml">
                            المرشحون
                        </div>
                        <div class="mv">
                            ${
                                election.candidate_count ??
                                0
                            }
                        </div>
                    </div>

                    <div class="meta-box">
                        <div class="ml">
                            المصوتون
                        </div>
                        <div class="mv">
                            ${
                                election.voter_count ??
                                0
                            }
                        </div>
                    </div>

                    <div class="meta-box">
                        <div class="ml">
                            المشاركة
                        </div>
                        <div class="mv">
                            ${
                                election.participation_rate ??
                                0
                            }%
                        </div>
                    </div>

                </div>


                <div class="box">

                    <h3>
                        المرشحون
                    </h3>

                    ${
                        candidates.length
                            ? candidates
                                .map(
                                    candidate => `
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
                                <div style="margin-top:18px">

                                    <div class="form-group">

                                        <label>
                                            إضافة مرشح بالـUID
                                        </label>

                                        <input
                                            id="candidateUidInput"
                                            type="text"
                                            placeholder="UID"
                                        >

                                    </div>

                                    <button
                                        class="green"
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

                    <h3>
                        النتائج
                    </h3>


                    <div class="stats">

                        <div class="stat">

                            <div class="l">
                                المصوتون
                            </div>

                            <div class="n">
                                ${
                                    resultsData.stats
                                        ?.voters ??
                                    0
                                }
                            </div>

                        </div>


                        <div class="stat">

                            <div class="l">
                                المؤهلون
                            </div>

                            <div class="n">
                                ${
                                    resultsData.stats
                                        ?.eligible ??
                                    0
                                }
                            </div>

                        </div>


                        <div class="stat">

                            <div class="l">
                                المشاركة
                            </div>

                            <div class="n">
                                ${
                                    resultsData.stats
                                        ?.participation_rate ??
                                    0
                                }%
                            </div>

                        </div>


                        <div class="stat">

                            <div class="l">
                                المقاعد
                            </div>

                            <div class="n">
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
                                    row => `
                                        <div class="result">

                                            <div class="r-top">

                                                <span>
                                                    ${escapeHtml(
                                                        row.nickname
                                                    )}
                                                </span>

                                                <span>
                                                    ${row.votes}
                                                    صوت —
                                                    ${row.percentage}%
                                                </span>

                                            </div>

                                            <div class="bar">

                                                <div
                                                    class="fill"
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

                    <h3>
                        المصوتون
                    </h3>

                    <div
                        style="
                            color:#806f5b;
                            font-size:11px;
                            line-height:1.8;
                            margin-bottom:10px;
                        "
                    >
                        تظهر هوية من صوّت ووقت تصويته فقط.
                        لا يتم عرض اختيار الناخب.
                    </div>


                    ${
                        voters.length
                            ? `
                                <div class="table">

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

                                            ${
                                                voters
                                                    .map(
                                                        voter => `
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
                                                    .join("")
                                            }

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

el("closeModal")?.addEventListener(
    "click",
    () => {

        el("electionModal")
            .classList.remove("show");
    }
);


el("electionModal")?.addEventListener(
    "click",
    event => {

        if (
            event.target ===
            el("electionModal")
        ) {
            el("electionModal")
                .classList.remove("show");
        }
    }
);


/* =========================================================
   CANDIDATES
========================================================= */

window.addCandidate =
    async function(
        electionId
    ) {

        const uid =
            el("candidateUidInput")
                ?.value
                .trim();

        if (!uid) {

            showMessage(
                el("candidateMessage"),
                "أدخل UID اللاعب."
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
    ?.addEventListener(
        "click",
        () => {

            showMessage(
                el("playersMessage"),
                "قسم رفع اللاعبين جاهز في الواجهة، لكن API فحص واستيراد CSV/Excel لم يتم تفعيله بعد."
            );
        }
    );


/* =========================================================
   RESTORE ADMIN SESSION AFTER REFRESH
========================================================= */

async function restoreAdminSession() {
    const token =
        localStorage.getItem("admin_session_token");

    const savedEmail =
        localStorage.getItem("admin_email") || "";

    if (!token) {
        return;
    }

    adminSessionToken = token;
    adminEmail = savedEmail;

    try {
        const response =
            await fetch(
                `${API_URL}/admin/test`,
                {
                    method: "GET",
                    headers: {
                        Authorization:
                            `Bearer ${adminSessionToken}`
                    }
                }
            );

        let data = null;

        try {
            data = await response.json();
        } catch {
            data = null;
        }

        if (
            !response.ok ||
            !data?.success
        ) {
            forceLogout();
            return;
        }

        const loginCard =
            el("loginCard");

        const dashboardCard =
            el("dashboardCard");

        if (loginCard) {
            loginCard.style.display =
                "none";
        }

        if (dashboardCard) {
            dashboardCard.style.display =
                "block";
        }

        const emailDisplay =
            el("adminEmailDisplay");

        if (emailDisplay) {
            emailDisplay.textContent =
                adminEmail;
        }

        await refreshAll();

    } catch (error) {

        console.error(
            "Session restore error:",
            error
        );

        /*
         * لا نحذف الجلسة عند وجود خطأ شبكة مؤقت.
         */
    }
}


/* =========================================================
   INITIAL
========================================================= */

updateChoiceLimits();
restoreAdminSession();
