const API_URL =
    "https://parliament-api.sog-parliament.workers.dev";

const verificationCard =
    document.getElementById("verificationCard");

const electionCard =
    document.getElementById("electionCard");

const form =
    document.getElementById("verificationForm");

const uidInput =
    document.getElementById("uid");

const ridInput =
    document.getElementById("rid");

const verifyButton =
    document.getElementById("verifyButton");

const message =
    document.getElementById("message");

const electionTitle =
    document.getElementById("electionTitle");

const electionInfo =
    document.getElementById("electionInfo");

const candidatesContainer =
    document.getElementById("candidatesContainer");

const electionMessage =
    document.getElementById("electionMessage");


/* =========================================================
   STATE
========================================================= */

const PLAYER_STORAGE_KEY =
    "sog_voting_player";

let currentPlayer = null;
let currentElection = null;
let currentElections = [];

let refreshTimer = null;
let endTimer = null;


/* =========================================================
   HELPERS
========================================================= */

function showMessage(
    element,
    text,
    type = "error"
) {
    if (!element) return;

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
    if (!element) return;

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


/* =========================================================
   TIME / STATUS
========================================================= */

function getElectionTimeState(election) {

    if (!election) {
        return "unknown";
    }

    const start =
        Date.parse(
            election.start_at || ""
        );

    const end =
        Date.parse(
            election.end_at || ""
        );

    if (
        Number.isNaN(start) ||
        Number.isNaN(end)
    ) {
        return "unknown";
    }

    const now = Date.now();

    if (now < start) {
        return "scheduled";
    }

    if (now >= end) {
        return "closed";
    }

    return "open";
}


function clearEndTimer() {

    if (endTimer) {
        clearTimeout(endTimer);
        endTimer = null;
    }
}


function clearRefreshTimer() {

    if (refreshTimer) {
        clearInterval(refreshTimer);
        refreshTimer = null;
    }
}


/* =========================================================
   PLAYER STORAGE
========================================================= */

function getStoredPlayer() {

    try {

        const raw =
            localStorage.getItem(
                PLAYER_STORAGE_KEY
            );

        return raw
            ? JSON.parse(raw)
            : null;

    } catch {

        return null;
    }
}


function savePlayer(player) {

    localStorage.setItem(
        PLAYER_STORAGE_KEY,
        JSON.stringify(player)
    );
}


function clearPlayerStorage() {

    localStorage.removeItem(
        PLAYER_STORAGE_KEY
    );
}


/* =========================================================
   LOCAL VOTE STORAGE
========================================================= */

function voteStorageKey(electionId) {

    return (
        "sog_vote_" +
        electionId +
        "_" +
        (currentPlayer?.uid || "")
    );
}


function getLocalVote(electionId) {

    try {

        const raw =
            localStorage.getItem(
                voteStorageKey(electionId)
            );

        return raw
            ? JSON.parse(raw)
            : null;

    } catch {

        return null;
    }
}


function saveLocalVote(
    electionId,
    candidateIds
) {

    localStorage.setItem(
        voteStorageKey(electionId),
        JSON.stringify({
            candidate_ids: candidateIds,
            saved_at:
                new Date().toISOString()
        })
    );
}


/* =========================================================
   API
========================================================= */

async function api(
    path,
    options = {}
) {

    const response =
        await fetch(
            `${API_URL}${path}`,
            options
        );

    let data = null;

    try {
        data =
            await response.json();
    } catch {
        data = null;
    }

    return {
        response,
        data
    };
}


/* =========================================================
   NAVIGATION
========================================================= */

function createNavigation() {

    if (
        document.getElementById(
            "votingNavigation"
        )
    ) {
        return;
    }

    const nav =
        document.createElement("div");

    nav.id =
        "votingNavigation";

    nav.style.display = "none";
    nav.style.gap = "10px";
    nav.style.flexWrap = "wrap";
    nav.style.marginBottom = "18px";


    const back =
        document.createElement("button");

    back.type = "button";
    back.textContent =
        "رجوع إلى التصويتات";

    back.style.width = "auto";
    back.style.marginTop = "0";

    back.addEventListener(
        "click",
        showVotingList
    );


    const logout =
        document.createElement("button");

    logout.type = "button";
    logout.textContent = "خروج";

    logout.style.width = "auto";
    logout.style.marginTop = "0";

    logout.addEventListener(
        "click",
        logoutPlayer
    );


    nav.appendChild(back);
    nav.appendChild(logout);

    electionCard.insertBefore(
        nav,
        electionCard.firstChild
    );
}


function showNavigation(show = true) {

    createNavigation();

    const nav =
        document.getElementById(
            "votingNavigation"
        );

    nav.style.display =
        show ? "flex" : "none";
}


/* =========================================================
   VOTING LIST
========================================================= */

async function loadVotingList() {

    if (!currentPlayer) {
        return;
    }

    hideMessage(electionMessage);

    electionTitle.textContent =
        "عمليات التصويت";

    electionInfo.textContent =
        "جاري تحميل عمليات التصويت...";

    candidatesContainer.innerHTML =
        "";

    showNavigation(true);

    try {

        const {
            response,
            data
        } =
            await api(
                `/elections?server_id=${encodeURIComponent(
                    currentPlayer.server_id
                )}&uid=${encodeURIComponent(
                    currentPlayer.uid
                )}`
            );

        if (
            !response.ok ||
            !data?.success
        ) {

            showMessage(
                electionMessage,
                data?.message ||
                "تعذر تحميل عمليات التصويت."
            );

            return;
        }


        currentElections =
            Array.isArray(
                data.elections
            )
                ? data.elections
                : [];


        renderVotingList();


    } catch (error) {

        console.error(error);

        showMessage(
            electionMessage,
            "حدث خطأ أثناء الاتصال بالخادم."
        );
    }
}


function makeSectionTitle(
    text
) {

    const title =
        document.createElement(
            "h2"
        );

    title.textContent =
        text;

    title.style.color =
        "#d9ad5b";

    title.style.margin =
        "20px 0 12px";

    title.style.fontSize =
        "22px";

    return title;
}


function makeElectionCard(
    election,
    mode
) {

    const card =
        document.createElement(
            "div"
        );

    card.style.marginBottom =
        "14px";

    card.style.padding =
        "16px";

    card.style.border =
        "1px solid rgba(190,145,70,.35)";

    card.style.borderRadius =
        "12px";

    card.style.background =
        "rgba(255,255,255,.02)";


    const title =
        document.createElement("div");

    title.textContent =
        election.title ||
        "عملية تصويت";

    title.style.fontSize =
        "18px";

    title.style.fontWeight =
        "700";

    title.style.color =
        "#d9ad5b";

    title.style.marginBottom =
        "8px";


    const description =
        document.createElement("div");

    description.textContent =
        election.description ||
        "";

    description.style.fontSize =
        "13px";

    description.style.lineHeight =
        "1.8";

    description.style.color =
        "#c5b49b";

    description.style.marginBottom =
        "10px";


    const details =
        document.createElement("div");

    details.style.fontSize =
        "12px";

    details.style.lineHeight =
        "1.9";

    details.style.color =
        "#918068";


    if (mode === "open") {

        const hasVoted =
            Boolean(
                election.has_voted
            ) ||
            Boolean(
                getLocalVote(
                    election.election_id
                )
            );

        details.innerHTML = `
            المقاعد:
            ${escapeHtml(election.seats)}
            —
            الاختيارات:
            ${escapeHtml(election.min_choices)}
            إلى
            ${escapeHtml(election.max_choices)}
            <br>
            البداية:
            ${escapeHtml(
                formatDate(
                    election.start_at
                )
            )}
            <br>
            النهاية:
            ${escapeHtml(
                formatDate(
                    election.end_at
                )
            )}
            <br>
            الحالة:
            ${
                hasVoted
                    ? "تم التصويت"
                    : "متاح للتصويت"
            }
        `;

    } else if (mode === "scheduled") {

        details.innerHTML = `
            البداية:
            ${escapeHtml(
                formatDate(
                    election.start_at
                )
            )}
            <br>
            النهاية:
            ${escapeHtml(
                formatDate(
                    election.end_at
                )
            )}
            <br>
            الحالة:
            مجدولة
        `;

    } else {

        details.innerHTML = `
            البداية:
            ${escapeHtml(
                formatDate(
                    election.start_at
                )
            )}
            <br>
            النهاية:
            ${escapeHtml(
                formatDate(
                    election.end_at
                )
            )}
            <br>
            الحالة:
            منتهية
        `;
    }


    const button =
        document.createElement("button");

    button.type = "button";


    if (mode === "open") {

        const hasVoted =
            Boolean(
                election.has_voted
            ) ||
            Boolean(
                getLocalVote(
                    election.election_id
                )
            );

        button.textContent =
            hasVoted
                ? "عرض تصويتي"
                : "دخول للتصويت";

        button.addEventListener(
            "click",
            () => openVoting(election)
        );

    } else if (
        mode === "closed"
    ) {

        button.textContent =
            "عرض النتائج";

        button.addEventListener(
            "click",
            () =>
                showResults(
                    election.election_id
                )
        );

    } else {

        button.textContent =
            "مجدولة";

        button.disabled =
            true;
    }


    button.style.marginTop =
        "12px";


    card.appendChild(title);
    card.appendChild(description);
    card.appendChild(details);
    card.appendChild(button);

    return card;
}


function renderVotingList() {

    candidatesContainer.innerHTML =
        "";

    const open = [];
    const scheduled = [];
    const closed = [];


    currentElections.forEach(
        election => {

            const state =
                getElectionTimeState(
                    election
                );

            if (
                state === "open"
            ) {

                open.push(
                    election
                );

            } else if (
                state === "scheduled"
            ) {

                scheduled.push(
                    election
                );

            } else if (
                state === "closed"
            ) {

                closed.push(
                    election
                );
            }
        }
    );


    if (open.length) {

        candidatesContainer.appendChild(
            makeSectionTitle(
                "التصويتات الجارية"
            )
        );

        open.forEach(
            election =>
                candidatesContainer.appendChild(
                    makeElectionCard(
                        election,
                        "open"
                    )
                )
        );
    }


    if (scheduled.length) {

        candidatesContainer.appendChild(
            makeSectionTitle(
                "التصويتات المجدولة"
            )
        );

        scheduled.forEach(
            election =>
                candidatesContainer.appendChild(
                    makeElectionCard(
                        election,
                        "scheduled"
                    )
                )
        );
    }


    if (closed.length) {

        candidatesContainer.appendChild(
            makeSectionTitle(
                "التصويتات المنتهية والنتائج"
            )
        );

        closed.forEach(
            election =>
                candidatesContainer.appendChild(
                    makeElectionCard(
                        election,
                        "closed"
                    )
                )
        );
    }


    if (
        !open.length &&
        !scheduled.length &&
        !closed.length
    ) {

        electionInfo.textContent =
            "لا توجد عمليات تصويت متاحة حاليًا.";

        showMessage(
            electionMessage,
            "لا توجد عمليات تصويت متاحة حاليًا."
        );

        return;
    }


    electionInfo.textContent =
        `الجارية: ${open.length} — المجدولة: ${scheduled.length} — المنتهية: ${closed.length}`;
}


/* =========================================================
   OPEN VOTING
========================================================= */

async function openVoting(
    election
) {

    const state =
        getElectionTimeState(
            election
        );


    if (state === "closed") {

        await showResults(
            election.election_id
        );

        return;
    }


    if (state !== "open") {

        showMessage(
            electionMessage,
            "التصويت غير متاح الآن."
        );

        return;
    }


    currentElection =
        election;

    clearRefreshTimer();
    clearEndTimer();


    const end =
        Date.parse(
            election.end_at
        );


    if (
        !Number.isNaN(end)
    ) {

        endTimer =
            setTimeout(
                () =>
                    showResults(
                        election.election_id
                    ),
                Math.max(
                    end -
                        Date.now() +
                        1000,
                    1000
                )
            );
    }


    electionTitle.textContent =
        election.title ||
        "عملية تصويت";

    electionInfo.textContent =
        "جاري تحميل المرشحين...";

    candidatesContainer.innerHTML =
        "";

    hideMessage(
        electionMessage
    );

    showNavigation(true);


    try {

        let candidates =
            Array.isArray(
                election.candidates
            )
                ? election.candidates
                : [];


        if (!candidates.length) {

            const {
                response,
                data
            } =
                await api(
                    `/election?server_id=${encodeURIComponent(
                        currentPlayer.server_id
                    )}`
                );


            if (
                response.ok &&
                data?.open &&
                data?.election?.election_id ===
                    election.election_id
            ) {

                candidates =
                    Array.isArray(
                        data.candidates
                    )
                        ? data.candidates
                        : [];
            }
        }


        if (!candidates.length) {

            showMessage(
                electionMessage,
                "لا يوجد مرشحون متاحون لهذه العملية."
            );

            return;
        }


        renderVotingForm(
            election,
            candidates
        );


    } catch (error) {

        console.error(error);

        showMessage(
            electionMessage,
            "تعذر تحميل المرشحين."
        );
    }
}
function renderVotingForm(
    election,
    candidates
) {

    const currentState =
        getElectionTimeState(
            election
        );


    if (
        currentState === "closed"
    ) {

        showResults(
            election.election_id
        );

        return;
    }


    electionTitle.textContent =
        election.title ||
        "عملية تصويت";


    const hasVoted =
        Boolean(
            election.has_voted
        ) ||
        Boolean(
            getLocalVote(
                election.election_id
            )
        );


    electionInfo.textContent =
        hasVoted
            ? "لقد سجلت تصويتك في هذه العملية. يمكنك المشاهدة فقط."
            : `المقاعد: ${election.seats} — اختر من ${election.min_choices} إلى ${election.max_choices}.`;


    candidatesContainer.innerHTML =
        "";


    const localVote =
        getLocalVote(
            election.election_id
        );


    const selectedIds =
        Array.isArray(
            localVote?.candidate_ids
        )
            ? localVote.candidate_ids
            : [];


    candidates.forEach(
        candidate => {

            const box =
                document.createElement(
                    "div"
                );

            box.style.marginBottom =
                "12px";

            box.style.padding =
                "15px";

            box.style.border =
                "1px solid rgba(190,145,70,.35)";

            box.style.borderRadius =
                "12px";

            box.style.background =
                "rgba(255,255,255,.02)";


            const label =
                document.createElement(
                    "label"
                );

            label.style.display =
                "flex";

            label.style.alignItems =
                "center";

            label.style.gap =
                "12px";

            label.style.margin =
                "0";

            label.style.cursor =
                hasVoted
                    ? "default"
                    : "pointer";


            const checkbox =
                document.createElement(
                    "input"
                );

            checkbox.type =
                "checkbox";

            checkbox.name =
                "candidate";

            checkbox.value =
                candidate.candidate_id;

            checkbox.checked =
                selectedIds.includes(
                    Number(
                        candidate.candidate_id
                    )
                );

            checkbox.disabled =
                hasVoted;

            checkbox.style.width =
                "20px";

            checkbox.style.height =
                "20px";


            const name =
                document.createElement(
                    "span"
                );

            name.textContent =
                candidate.nickname;

            name.style.color =
                "#f5ead7";

            name.style.fontSize =
                "16px";


            label.appendChild(
                checkbox
            );

            label.appendChild(
                name
            );

            box.appendChild(
                label
            );

            candidatesContainer.appendChild(
                box
            );
        }
    );


    if (hasVoted) {

        const notice =
            document.createElement(
                "div"
            );

        notice.style.marginTop =
            "14px";

        notice.style.padding =
            "12px";

        notice.style.borderRadius =
            "10px";

        notice.style.background =
            "rgba(46,125,50,.15)";

        notice.style.border =
            "1px solid rgba(76,175,80,.4)";

        notice.style.color =
            "#9be7a0";

        notice.textContent =
            "تم تسجيل تصويتك. لا يمكن تعديل التصويت.";

        candidatesContainer.appendChild(
            notice
        );

        return;
    }


    const submit =
        document.createElement(
            "button"
        );

    submit.type =
        "button";

    submit.textContent =
        "تأكيد التصويت";

    submit.addEventListener(
        "click",
        submitVote
    );

    candidatesContainer.appendChild(
        submit
    );
}


/* =========================================================
   SUBMIT VOTE
========================================================= */

async function submitVote() {

    if (
        !currentPlayer ||
        !currentElection
    ) {
        return;
    }


    if (
        getElectionTimeState(
            currentElection
        ) !== "open"
    ) {

        await showResults(
            currentElection.election_id
        );

        return;
    }


    const selected =
        Array.from(
            document.querySelectorAll(
                'input[name="candidate"]:checked'
            )
        );


    const candidateIds =
        selected.map(
            checkbox =>
                Number(
                    checkbox.value
                )
        );


    if (
        candidateIds.length <
            currentElection.min_choices ||
        candidateIds.length >
            currentElection.max_choices
    ) {

        showMessage(
            electionMessage,
            `يجب اختيار من ${currentElection.min_choices} إلى ${currentElection.max_choices} مرشحين.`
        );

        return;
    }


    const button =
        Array.from(
            candidatesContainer
                .querySelectorAll(
                    "button"
                )
        ).at(-1);


    if (button) {
        button.disabled = true;
        button.textContent =
            "جاري تسجيل التصويت...";
    }


    try {

        const {
            response,
            data
        } =
            await api(
                "/vote",
                {
                    method: "POST",

                    headers: {
                        "Content-Type":
                            "application/json"
                    },

                    body:
                        JSON.stringify({
                            uid:
                                currentPlayer.uid,

                            rid:
                                currentPlayer.rid,

                            election_id:
                                currentElection.election_id,

                            candidate_ids:
                                candidateIds
                        })
                }
            );


        if (
            !response.ok ||
            !data?.success
        ) {

            showMessage(
                electionMessage,
                data?.message ||
                "تعذر تسجيل التصويت."
            );

            if (button) {
                button.disabled = false;
                button.textContent =
                    "تأكيد التصويت";
            }

            return;
        }


        saveLocalVote(
            currentElection.election_id,
            candidateIds
        );


        currentElection = {
            ...currentElection,
            has_voted: true
        };


        renderVotingForm(
            currentElection,
            currentElection.candidates || []
        );


        showMessage(
            electionMessage,
            "تم تسجيل تصويتك بنجاح. لا يمكن تعديل التصويت.",
            "success"
        );


    } catch (error) {

        console.error(error);

        showMessage(
            electionMessage,
            "حدث خطأ أثناء الاتصال بالخادم."
        );

        if (button) {
            button.disabled = false;
            button.textContent =
                "تأكيد التصويت";
        }
    }
}


/* =========================================================
   RESULTS
========================================================= */

async function showResults(
    electionId
) {

    clearEndTimer();
    clearRefreshTimer();

    currentElection = null;

    try {

        const {
            response,
            data
        } =
            await api(
                `/results?election_id=${encodeURIComponent(
                    electionId
                )}`
            );


        if (
            !response.ok ||
            !data?.success
        ) {

            showMessage(
                electionMessage,
                data?.message ||
                "النتائج غير متاحة حاليًا."
            );

            return;
        }


        renderResults(
            data
        );


    } catch (error) {

        console.error(error);

        showMessage(
            electionMessage,
            "تعذر تحميل النتائج."
        );
    }
}


function renderResults(
    data
) {

    showNavigation(
        Boolean(currentPlayer)
    );


    electionTitle.textContent =
        data.election?.title ||
        "نتائج التصويت";


    electionInfo.textContent =
        `انتهت عملية التصويت في ${formatDate(
            data.election?.end_at
        )}.`;


    candidatesContainer.innerHTML =
        "";


    const results =
        Array.isArray(
            data.results
        )
            ? data.results
            : [];


    const stats =
        data.stats || {};


    const statsBox =
        document.createElement(
            "div"
        );

    statsBox.style.display =
        "grid";

    statsBox.style.gridTemplateColumns =
        "repeat(auto-fit,minmax(130px,1fr))";

    statsBox.style.gap =
        "10px";

    statsBox.style.marginBottom =
        "18px";


    const statsList = [
    [
        "المصوتون",
        stats.voters ?? 0
    ]
];


    statsList.forEach(
        ([label, value]) => {

            const box =
                document.createElement(
                    "div"
                );

            box.style.padding =
                "14px";

            box.style.border =
                "1px solid rgba(190,145,70,.3)";

            box.style.borderRadius =
                "12px";

            box.style.textAlign =
                "center";


            box.innerHTML = `
                <div
                    style="
                        color:#917e62;
                        font-size:12px;
                        margin-bottom:6px;
                    "
                >
                    ${escapeHtml(label)}
                </div>

                <div
                    style="
                        color:#d9ad5b;
                        font-size:22px;
                        font-weight:bold;
                    "
                >
                    ${escapeHtml(value)}
                </div>
            `;


            statsBox.appendChild(
                box
            );
        }
    );


    candidatesContainer.appendChild(
        statsBox
    );


    if (!results.length) {

        const empty =
            document.createElement(
                "div"
            );

        empty.style.padding =
            "20px";

        empty.style.border =
            "1px dashed rgba(190,145,70,.35)";

        empty.style.borderRadius =
            "12px";

        empty.style.textAlign =
            "center";

        empty.style.color =
            "#9b8b72";

        empty.textContent =
            "لا توجد أصوات مسجلة.";

        candidatesContainer.appendChild(
            empty
        );

    } else {

        results.forEach(
            (row, index) => {

                const item =
                    document.createElement(
                        "div"
                    );

                item.style.marginBottom =
                    "12px";

                item.style.padding =
                    "14px";

                item.style.border =
                    "1px solid rgba(190,145,70,.3)";

                item.style.borderRadius =
                    "12px";


                const percent =
                    Number(
                        row.percentage
                    ) || 0;


                item.innerHTML = `
                    <div
                        style="
                            display:flex;
                            justify-content:space-between;
                            gap:10px;
                            margin-bottom:8px;
                        "
                    >
                        <strong
                            style="color:#f5ead7"
                        >
                            ${index + 1}.
                            ${escapeHtml(
                                row.nickname
                            )}
                        </strong>

                        <span
                            style="
                                color:#d9ad5b;
                                font-weight:bold;
                            "
                        >
                            ${escapeHtml(
                                row.votes ?? 0
                            )}
                            صوت —
                            ${escapeHtml(
                                percent
                            )}%
                        </span>
                    </div>

                    <div
                        style="
                            height:10px;
                            background:#261c12;
                            border-radius:999px;
                            overflow:hidden;
                        "
                    >
                        <div
                            style="
                                width:${Math.max(
                                    0,
                                    Math.min(
                                        100,
                                        percent
                                    )
                                )}%;
                                height:100%;
                                background:linear-gradient(
                                    90deg,
                                    #d4a54f,
                                    #9a6b25
                                );
                            "
                        ></div>
                    </div>
                `;


                candidatesContainer.appendChild(
                    item
                );
            }
        );
    }


    if (currentPlayer) {

        const back =
            document.createElement(
                "button"
            );

        back.type = "button";
        back.textContent =
            "رجوع إلى التصويتات";

        back.style.marginTop =
            "14px";

        back.addEventListener(
            "click",
            showVotingList
        );

        candidatesContainer.appendChild(
            back
        );
    }
}
/* =========================================================
   RETURN TO VOTING LIST
========================================================= */

function showVotingList() {

    if (!currentPlayer) {
        return;
    }

    clearEndTimer();

    currentElection =
        null;

    loadVotingList();
}


/* =========================================================
   LOGOUT
========================================================= */

function logoutPlayer() {

    clearEndTimer();
    clearRefreshTimer();

    currentPlayer = null;
    currentElection = null;
    currentElections = [];

    clearPlayerStorage();

    uidInput.value = "";
    ridInput.value = "";

    electionTitle.textContent =
        "نظام التصويت";

    electionInfo.textContent =
        "أدخل بيانات حسابك للتحقق من أهليتك والمشاركة في التصويت.";

    candidatesContainer.innerHTML =
        "";

    hideMessage(
        electionMessage
    );

    electionCard.style.display =
        "none";

    verificationCard.style.display =
        "block";

    showNavigation(false);
}


/* =========================================================
   VERIFY
========================================================= */

form.addEventListener(
    "submit",
    async event => {

        event.preventDefault();

        hideMessage(
            message
        );


        const uid =
            uidInput.value.trim();

        const rid =
            ridInput.value.trim();


        if (!uid) {

            showMessage(
                message,
                "يرجى إدخال رقم هوية الحساب."
            );

            return;
        }


        if (!rid) {

            showMessage(
                message,
                "يرجى إدخال رقم الهوية بالمملكة."
            );

            return;
        }


        verifyButton.disabled =
            true;

        verifyButton.textContent =
            "جاري التحقق...";


        try {

            const {
                response,
                data
            } =
                await api(
                    "/verify",
                    {
                        method: "POST",

                        headers: {
                            "Content-Type":
                                "application/json"
                        },

                        body:
                            JSON.stringify({
                                uid,
                                rid
                            })
                    }
                );


            if (
                !response.ok ||
                !data?.valid
            ) {

                showMessage(
                    message,
                    data?.message ||
                    "بيانات الحساب غير صحيحة."
                );

                return;
            }


            currentPlayer = {

                uid,

                rid,

                server_id:
                    data.server_id,

                nickname:
                    data.nickname
            };


            savePlayer(
                currentPlayer
            );


            verificationCard.style.display =
                "none";

            electionCard.style.display =
                "block";


            await loadVotingList();


        } catch (error) {

            console.error(error);

            showMessage(
                message,
                "حدث خطأ أثناء الاتصال بالخادم."
            );

        } finally {

            verifyButton.disabled =
                false;

            verifyButton.textContent =
                "متابعة";
        }
    }
);


/* =========================================================
   RESTORE SESSION
========================================================= */

async function restorePlayerSession() {

    const saved =
        getStoredPlayer();


    if (
        !saved?.uid ||
        !saved?.rid
    ) {
        return;
    }


    try {

        const {
            response,
            data
        } =
            await api(
                "/verify",
                {
                    method: "POST",

                    headers: {
                        "Content-Type":
                            "application/json"
                    },

                    body:
                        JSON.stringify({
                            uid:
                                saved.uid,

                            rid:
                                saved.rid
                        })
                }
            );


        if (
            !response.ok ||
            !data?.valid
        ) {

            clearPlayerStorage();
            return;
        }


        currentPlayer = {

            uid:
                saved.uid,

            rid:
                saved.rid,

            server_id:
                data.server_id,

            nickname:
                data.nickname
        };


        verificationCard.style.display =
            "none";

        electionCard.style.display =
            "block";


        await loadVotingList();


    } catch (error) {

        console.error(
            "Session restore:",
            error
        );
    }
}


/* =========================================================
   PUBLIC RESULTS WITHOUT LOGIN
========================================================= */

function getPublicResultId() {

    const params =
        new URLSearchParams(
            window.location.search
        );

    return (
        params.get("results") ||
        params.get("result") ||
        null
    );
}


async function loadPublicResults() {

    const electionId =
        getPublicResultId();


    if (!electionId) {
        return false;
    }


    verificationCard.style.display =
        "none";

    electionCard.style.display =
        "block";


    showNavigation(false);


    await showResults(
        electionId
    );


    return true;
}


/* =========================================================
   AUTO REFRESH
========================================================= */

function startAutoRefresh() {

    clearRefreshTimer();


    refreshTimer =
        setInterval(
            async () => {

                if (
                    currentPlayer &&
                    !currentElection
                ) {

                    await loadVotingList();
                }

            },
            30000
        );
}


/* =========================================================
   INITIALIZATION
========================================================= */

document.addEventListener(
    "DOMContentLoaded",
    async () => {

        createNavigation();

        const isPublic =
            await loadPublicResults();

        if (isPublic) {
            return;
        }

        startAutoRefresh();

        await restorePlayerSession();
    }
);
