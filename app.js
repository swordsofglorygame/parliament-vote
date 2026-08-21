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
    document.getElementById(
        "candidatesContainer"
    );

const electionMessage =
    document.getElementById(
        "electionMessage"
    );


/* =========================================================
   STATE
========================================================= */

const PLAYER_STORAGE_KEY =
    "sog_voting_player";

let currentPlayer = null;
let currentElection = null;
let currentElections = [];
let electionEndTimer = null;
let electionsRefreshTimer = null;


/* =========================================================
   HELPERS
========================================================= */

function showMessage(
    element,
    text,
    type = "error"
) {
    if (!element) return;

    element.style.display =
        "block";

    element.textContent =
        text;

    if (type === "success") {

        element.style.background =
            "rgba(46, 125, 50, 0.15)";

        element.style.border =
            "1px solid rgba(76, 175, 80, 0.4)";

        element.style.color =
            "#9be7a0";

    } else {

        element.style.background =
            "rgba(198, 40, 40, 0.15)";

        element.style.border =
            "1px solid rgba(239, 83, 80, 0.4)";

        element.style.color =
            "#ff9d9d";
    }
}


function hideMessage(element) {

    if (!element) return;

    element.style.display =
        "none";

    element.textContent =
        "";
}


function escapeHtml(value) {

    return String(value ?? "")
        .replaceAll(
            "&",
            "&amp;"
        )
        .replaceAll(
            "<",
            "&lt;"
        )
        .replaceAll(
            ">",
            "&gt;"
        )
        .replaceAll(
            '"',
            "&quot;"
        )
        .replaceAll(
            "'",
            "&#039;"
        );
}


function formatDate(value) {

    if (!value) {
        return "-";
    }

    const date =
        new Date(value);

    if (
        Number.isNaN(
            date.getTime()
        )
    ) {
        return String(value);
    }

    return date
        .toISOString()
        .replace(
            "T",
            " "
        )
        .replace(
            ".000Z",
            " UTC"
        );
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


function storePlayer(player) {

    localStorage.setItem(
        PLAYER_STORAGE_KEY,
        JSON.stringify(player)
    );
}


function clearStoredPlayer() {

    localStorage.removeItem(
        PLAYER_STORAGE_KEY
    );
}


/* =========================================================
   VOTE STORAGE
========================================================= */

function getElectionVoteKey(
    electionId
) {

    return (
        "sog_vote_" +
        electionId +
        "_" +
        (currentPlayer?.uid || "")
    );
}


function getLocalVote(
    electionId
) {

    try {

        const raw =
            localStorage.getItem(
                getElectionVoteKey(
                    electionId
                )
            );

        return raw
            ? JSON.parse(raw)
            : null;

    } catch {

        return null;
    }
}


function storeLocalVote(
    electionId,
    candidateIds
) {

    localStorage.setItem(
        getElectionVoteKey(
            electionId
        ),
        JSON.stringify({
            candidate_ids:
                candidateIds,

            saved_at:
                new Date().toISOString()
        })
    );
}


/* =========================================================
   ELECTION HELPERS
========================================================= */

function getElectionCandidates(
    election
) {

    return Array.isArray(
        election?.candidates
    )
        ? election.candidates
        : [];
}


function getElectionHasVoted(
    election
) {

    return Boolean(
        election?.has_voted ??
        election?.voted ??
        false
    );
}


function getElectionTimeState(election) {

    if (!election) {
        return "unknown";
    }

    const start = Date.parse(
        election.start_at || ""
    );

    const end = Date.parse(
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

    if (now > end) {
        return "closed";
    }

    return "open";
}


function clearElectionEndTimer() {

    if (electionEndTimer) {

        clearTimeout(
            electionEndTimer
        );

        electionEndTimer =
            null;
    }
}


function startElectionsRefresh() {

    if (electionsRefreshTimer) {
        return;
    }

    electionsRefreshTimer =
        setInterval(
            async () => {

                if (
                    !currentPlayer ||
                    currentElection
                ) {
                    return;
                }

                await loadElectionsList();
            },
            30000
        );
}


function stopElectionsRefresh() {

    if (electionsRefreshTimer) {

        clearInterval(
            electionsRefreshTimer
        );

        electionsRefreshTimer =
            null;
    }
}


function scheduleElectionEnd(
    election
) {

    clearElectionEndTimer();

    if (!election?.end_at) {
        return;
    }

    const end =
        Date.parse(
            election.end_at
        );

    if (Number.isNaN(end)) {
        return;
    }

    const delay =
        Math.max(
            end -
                Date.now() +
                1000,
            1000
        );

    electionEndTimer =
        setTimeout(
            async () => {

                electionEndTimer =
                    null;

                if (
                    !currentElection ||
                    currentElection.election_id !==
                        election.election_id
                ) {
                    return;
                }

                await showResults(
                    election.election_id
                );
            },
            delay
        );
}


function getPublicResultsElectionId() {

    const params =
        new URLSearchParams(
            window.location.search
        );

    return (
        params.get(
            "results"
        ) ||
        params.get(
            "result"
        ) ||
        null
    );
}


/* =========================================================
   DYNAMIC NAVIGATION
========================================================= */

function ensureVotingNavigation() {

    let navigation =
        document.getElementById(
            "votingNavigation"
        );

    if (navigation) {
        return navigation;
    }

    navigation =
        document.createElement(
            "div"
        );

    navigation.id =
        "votingNavigation";

    navigation.style.display =
        "none";

    navigation.style.gap =
        "10px";

    navigation.style.flexWrap =
        "wrap";

    navigation.style.marginBottom =
        "18px";


    const backButton =
        document.createElement(
            "button"
        );

    backButton.type =
        "button";

    backButton.id =
        "backToElectionsButton";

    backButton.textContent =
        "رجوع إلى التصويتات";

    backButton.style.width =
        "auto";

    backButton.style.marginTop =
        "0";

    backButton.addEventListener(
        "click",
        showElectionsList
    );


    const logoutButton =
        document.createElement(
            "button"
        );

    logoutButton.type =
        "button";

    logoutButton.id =
        "playerLogoutButton";

    logoutButton.textContent =
        "خروج";

    logoutButton.style.width =
        "auto";

    logoutButton.style.marginTop =
        "0";

    logoutButton.addEventListener(
        "click",
        logoutPlayer
    );


    navigation.appendChild(
        backButton
    );

    navigation.appendChild(
        logoutButton
    );


    electionCard.insertBefore(
        navigation,
        electionCard.firstChild
    );

    return navigation;
}


function showNavigation() {

    const navigation =
        ensureVotingNavigation();

    navigation.style.display =
        "flex";
}


function hideNavigation() {

    const navigation =
        ensureVotingNavigation();

    navigation.style.display =
        "none";
}


/* =========================================================
   API
========================================================= */

async function fetchJson(
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
   LOAD ALL AVAILABLE VOTINGS
========================================================= */

async function loadElectionsList() {

    if (!currentPlayer) {
        return;
    }

    clearElectionEndTimer();
    startElectionsRefresh();

    electionTitle.textContent =
        "عمليات التصويت";

    electionInfo.textContent =
        "جاري تحميل التصويتات المتاحة لسيرفرك...";

    candidatesContainer.innerHTML =
        "";

    hideMessage(
        electionMessage
    );

    showNavigation();

    try {

        const {
            response,
            data
        } =
            await fetchJson(
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

            electionInfo.textContent =
                "تعذر تحميل عمليات التصويت.";

            showMessage(
                electionMessage,
                data?.message ||
                "تعذر تحميل التصويتات المتاحة."
            );

            return;
        }

        /*
         * حماية إضافية من الواجهة:
         * أي تصويت بدأ وانتهى فعليًا لا يظهر ضمن
         * قائمة التصويتات المتاحة حتى لو أعاده
         * الخادم بالخطأ.
         */
        currentElections =
            (
                Array.isArray(
                    data.elections
                )
                    ? data.elections
                    : []
            ).filter(
                election =>
                    getElectionTimeState(
                        election
                    ) === "open"
            );

        renderElectionsList();

    } catch (
        error
    ) {

        console.error(
            error
        );

        electionInfo.textContent =
            "تعذر الاتصال بخادم التصويت.";

        showMessage(
            electionMessage,
            "حدث خطأ أثناء تحميل عمليات التصويت."
        );
    }
}


/* =========================================================
   RENDER ALL VOTINGS
========================================================= */

function renderElectionsList() {

    candidatesContainer.innerHTML =
        "";

    if (
        !currentElections.length
    ) {

        electionInfo.textContent =
            "لا توجد عمليات تصويت جارية حاليًا.";

        showMessage(
            electionMessage,
            "لا توجد عمليات تصويت متاحة الآن. النتائج تصبح متاحة بعد انتهاء كل عملية."
        );

        return;
    }

    electionInfo.textContent =
        `تم العثور على ${currentElections.length} عملية تصويت جارية. اختر العملية التي تريد المشاركة فيها.`;

    currentElections.forEach(
        election => {

            const box =
                document.createElement(
                    "div"
                );

            box.style.marginBottom =
                "14px";

            box.style.padding =
                "16px";

            box.style.border =
                "1px solid rgba(190, 145, 70, 0.35)";

            box.style.borderRadius =
                "12px";

            box.style.background =
                "rgba(255, 255, 255, 0.02)";

            const title =
                document.createElement(
                    "div"
                );

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
                document.createElement(
                    "div"
                );

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

            const meta =
                document.createElement(
                    "div"
                );

            meta.style.fontSize =
                "12px";

            meta.style.lineHeight =
                "1.9";

            meta.style.color =
                "#918068";

            const hasVoted =
                getElectionHasVoted(
                    election
                ) ||
                Boolean(
                    getLocalVote(
                        election.election_id
                    )
                );

            meta.innerHTML = `
                المقاعد: ${escapeHtml(
                    election.seats ??
                    "-"
                )}
                —
                الاختيارات: ${escapeHtml(
                    election.min_choices ??
                    1
                )}
                إلى ${escapeHtml(
                    election.max_choices ??
                    "-"
                )}
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
                ${hasVoted
                    ? "تم التصويت"
                    : "متاح للتصويت"}
            `;

            const button =
                document.createElement(
                    "button"
                );

            button.type =
                "button";

            button.textContent =
                hasVoted
                    ? "عرض تصويتي"
                    : "دخول للتصويت";

            button.style.marginTop =
                "12px";

            button.addEventListener(
                "click",
                () =>
                    openElection(
                        election
                    )
            );

            box.appendChild(
                title
            );

            box.appendChild(
                description
            );

            box.appendChild(
                meta
            );

            box.appendChild(
                button
            );

            candidatesContainer.appendChild(
                box
            );
        }
    );
}


/* =========================================================
   OPEN ONE VOTING
========================================================= */

async function openElection(
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
            "هذه العملية غير متاحة للتصويت في الوقت الحالي."
        );

        return;
    }

    currentElection =
        election;

    stopElectionsRefresh();

    hideMessage(
        electionMessage
    );

    electionTitle.textContent =
        election.title ||
        "عملية تصويت";

    electionInfo.textContent =
        "جاري تحميل بيانات التصويت...";

    candidatesContainer.innerHTML =
        "";

    showNavigation();

    scheduleElectionEnd(
        election
    );

    try {

        let selectedElection =
            election;

        let candidates =
            getElectionCandidates(
                selectedElection
            );

        if (
            !candidates.length
        ) {

            const {
                response,
                data
            } =
                await fetchJson(
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

                selectedElection = {

                    ...election,

                    ...data.election,

                    candidates:
                        Array.isArray(
                            data.candidates
                        )
                            ? data.candidates
                            : []
                };

                currentElection =
                    selectedElection;

                candidates =
                    getElectionCandidates(
                        selectedElection
                    );
            }
        }

        if (
            getElectionTimeState(
                selectedElection
            ) !== "open"
        ) {

            await showResults(
                selectedElection.election_id
            );

            return;
        }

        if (
            !candidates.length
        ) {

            electionInfo.textContent =
                "لم يتم تحميل مرشحي عملية التصويت.";

            showMessage(
                electionMessage,
                "لا يوجد مرشحون متاحون لهذه العملية حاليًا."
            );

            return;
        }

        renderSelectedElection(
            selectedElection,
            candidates
        );

    } catch (
        error
    ) {

        console.error(
            error
        );

        electionInfo.textContent =
            "تعذر تحميل بيانات التصويت.";

        showMessage(
            electionMessage,
            "حدث خطأ أثناء تحميل بيانات التصويت."
        );
    }
}


/* =========================================================
   RENDER SELECTED VOTING
========================================================= */

function renderSelectedElection(
    election,
    candidates
) {

    const state =
        getElectionTimeState(
            election
        );

    if (state === "closed") {

        showResults(
            election.election_id
        );

        return;
    }

    if (state !== "open") {

        showElectionsList();

        return;
    }

    const hasVoted =
        getElectionHasVoted(
            election
        ) ||
        Boolean(
            getLocalVote(
                election.election_id
            )
        );

    electionTitle.textContent =
        election.title ||
        "عملية تصويت";

    electionInfo.textContent =
        hasVoted
            ? "لقد شاركت في هذه العملية بالفعل. يمكنك مشاهدة تصويتك فقط."
            : `المقاعد: ${election.seats} — يمكنك اختيار من ${election.min_choices} إلى ${election.max_choices} مرشحين.`;

    candidatesContainer.innerHTML =
        "";

    const vote =
        getLocalVote(
            election.election_id
        );

    const selectedIds =
        Array.isArray(
            vote?.candidate_ids
        )
            ? vote.candidate_ids
            : [];

    candidates.forEach(
        candidate => {

            const candidateBox =
                document.createElement(
                    "div"
                );

            candidateBox.style.marginBottom =
                "12px";

            candidateBox.style.padding =
                "15px";

            candidateBox.style.border =
                "1px solid rgba(190, 145, 70, 0.35)";

            candidateBox.style.borderRadius =
                "12px";

            candidateBox.style.background =
                "rgba(255, 255, 255, 0.02)";

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

            label.style.cursor =
                hasVoted
                    ? "default"
                    : "pointer";

            label.style.margin =
                "0";

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

            checkbox.style.cursor =
                hasVoted
                    ? "default"
                    : "pointer";

            const name =
                document.createElement(
                    "span"
                );

            name.textContent =
                candidate.nickname;

            name.style.fontSize =
                "16px";

            name.style.color =
                "#f5ead7";

            label.appendChild(
                checkbox
            );

            label.appendChild(
                name
            );

            candidateBox.appendChild(
                label
            );

            candidatesContainer.appendChild(
                candidateBox
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
            "تم تسجيل تصويتك في هذه العملية. لا يمكن تعديل التصويت.";

        candidatesContainer.appendChild(
            notice
        );

        scheduleElectionEnd(
            election
        );

        return;
    }

    const voteButton =
        document.createElement(
            "button"
        );

    voteButton.type =
        "button";

    voteButton.id =
        "voteButton";

    voteButton.textContent =
        "تأكيد التصويت";

    voteButton.addEventListener(
        "click",
        submitVote
    );

    candidatesContainer.appendChild(
        voteButton
    );

    scheduleElectionEnd(
        election
    );
}


/* =========================================================
   PUBLIC RESULTS VIEW
========================================================= */

async function showResults(
    electionId,
    publicMode = false
) {

    clearElectionEndTimer();
    stopElectionsRefresh();

    currentElection =
        null;

    const navigation =
        ensureVotingNavigation();

    navigation.style.display =
        publicMode
            ? "none"
            : "flex";

    electionTitle.textContent =
        "نتائج التصويت";

    electionInfo.textContent =
        "جاري تحميل النتائج...";

    candidatesContainer.innerHTML =
        "";

    hideMessage(
        electionMessage
    );

    try {

        const {
            response,
            data
        } =
            await fetchJson(
                `/results?election_id=${encodeURIComponent(
                    electionId
                )}`
            );

        if (
            !response.ok ||
            !data?.success
        ) {

            electionInfo.textContent =
                "النتائج غير متاحة حاليًا.";

            showMessage(
                electionMessage,
                data?.message ||
                "تعذر تحميل نتائج التصويت."
            );

            return;
        }

        const election =
            data.election || {};

        electionTitle.textContent =
            election.title ||
            "نتائج التصويت";

        electionInfo.textContent =
            `انتهت عملية التصويت بتاريخ ${formatDate(
                election.end_at
            )}.`;

        renderResults(
            data
        );

    } catch (error) {

        console.error(
            "Results error:",
            error
        );

        electionInfo.textContent =
            "تعذر تحميل النتائج.";

        showMessage(
            electionMessage,
            "حدث خطأ أثناء تحميل النتائج."
        );
    }
}


function renderResults(
    data
) {

    const stats =
        data.stats || {};

    const results =
        Array.isArray(
            data.results
        )
            ? data.results
            : [];

    const wrapper =
        document.createElement(
            "div"
        );

    wrapper.style.marginTop =
        "10px";

    const statsBox =
        document.createElement(
            "div"
        );

    statsBox.style.display =
        "grid";

    statsBox.style.gridTemplateColumns =
        "repeat(auto-fit, minmax(130px, 1fr))";

    statsBox.style.gap =
        "10px";

    statsBox.style.marginBottom =
        "18px";

    const statsItems = [
        ["المصوتون", stats.voters ?? 0],
        ["غير المصوتين", stats.not_voted ?? 0],
        ["نسبة المشاركة", `${stats.participation_rate ?? 0}%`]
    ];

    statsItems.forEach(
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
                        font-size:12px;
                        color:#917e62;
                        margin-bottom:7px;
                    "
                >
                    ${escapeHtml(label)}
                </div>

                <div
                    style="
                        font-size:22px;
                        font-weight:700;
                        color:#d9ad5b;
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

    wrapper.appendChild(
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
            "لا توجد أصوات مسجلة في هذه العملية.";

        wrapper.appendChild(
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
                            style="
                                color:#f5ead7;
                            "
                        >
                            ${index + 1}.
                            ${escapeHtml(
                                row.nickname
                            )}
                        </strong>

                        <span
                            style="
                                color:#d9ad5b;
                                font-weight:700;
                            "
                        >
                            ${escapeHtml(
                                row.votes ??
                                0
                            )}
                            صوت
                            —
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

                wrapper.appendChild(
                    item
                );
            }
        );
    }

    candidatesContainer.appendChild(
        wrapper
    );

    if (
        !new URLSearchParams(
            window.location.search
        ).has("results")
    ) {

        const backButton =
            document.createElement(
                "button"
            );

        backButton.type =
            "button";

        backButton.textContent =
            currentPlayer
                ? "رجوع إلى التصويتات"
                : "العودة";

        backButton.style.marginTop =
            "14px";

        backButton.addEventListener(
            "click",
            () => {

                if (currentPlayer) {

                    showElectionsList();

                } else {

                    window.history.back();
                }
            }
        );

        candidatesContainer.appendChild(
            backButton
        );
    }
}


/* =========================================================
   SUBMIT VOTE
========================================================= */

async function submitVote() {

    if (
        !currentPlayer ||
        !currentElection
    ) {

        showMessage(
            electionMessage,
            "بيانات التصويت غير مكتملة."
        );

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


    const selectedIds =
        selected.map(
            checkbox =>
                Number(
                    checkbox.value
                )
        );


    if (
        selectedIds.length <
            currentElection.min_choices ||
        selectedIds.length >
            currentElection.max_choices
    ) {

        showMessage(
            electionMessage,
            `يجب اختيار من ${currentElection.min_choices} إلى ${currentElection.max_choices} مرشحين.`
        );

        return;
    }


    const voteButton =
        document.getElementById(
            "voteButton"
        );


    if (voteButton) {

        voteButton.disabled =
            true;

        voteButton.textContent =
            "جاري تسجيل التصويت...";
    }


    hideMessage(
        electionMessage
    );


    try {

        const {
            response,
            data
        } =
            await fetchJson(
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
                                selectedIds

                        })
                }
            );


        if (
            !response.ok ||
            !data.success
        ) {

            if (
                data?.error ===
                "ALREADY_VOTED"
            ) {

                currentElection = {
                    ...currentElection,
                    has_voted:
                        true
                };

                showMessage(
                    electionMessage,
                    "لقد قمت بالتصويت بالفعل في هذه العملية."
                );

            } else if (
                data?.error ===
                "RID_MISMATCH"
            ) {

                showMessage(
                    electionMessage,
                    "تعذر التحقق من بيانات الحساب."
                );

            } else if (
                data?.error ===
                "ELECTION_CLOSED"
            ) {

                showMessage(
                    electionMessage,
                    "انتهت فترة التصويت."
                );

            } else {

                showMessage(
                    electionMessage,
                    data?.message ||
                    "تعذر تسجيل التصويت."
                );
            }


            if (voteButton) {

                voteButton.disabled =
                    false;

                voteButton.textContent =
                    "تأكيد التصويت";
            }


            return;
        }


        storeLocalVote(
            currentElection.election_id,
            selectedIds
        );


        currentElection = {
            ...currentElection,
            has_voted:
                true
        };


        const index =
            currentElections.findIndex(
                item =>
                    item.election_id ===
                    currentElection.election_id
            );


        if (
            index >= 0
        ) {

            currentElections[index] = {

                ...currentElections[index],

                has_voted:
                    true
            };
        }


        renderSelectedElection(
            currentElection,
            getElectionCandidates(
                currentElection
            )
        );


        electionInfo.textContent =
            "تم تسجيل تصويتك بنجاح. لا يمكن تعديل التصويت بعد إرساله.";


        showMessage(
            electionMessage,
            "تم تسجيل تصويتك بنجاح.",
            "success"
        );


    } catch (
        error
    ) {

        console.error(
            error
        );


        showMessage(
            electionMessage,
            "حدث خطأ أثناء الاتصال بخادم التصويت."
        );


        if (voteButton) {

            voteButton.disabled =
                false;

            voteButton.textContent =
                "تأكيد التصويت";
        }
    }
}


/* =========================================================
   BACK TO ALL VOTINGS
========================================================= */

function showElectionsList() {

    if (!currentPlayer) {
        return;
    }

    clearElectionEndTimer();

    currentElection =
        null;


    electionTitle.textContent =
        "عمليات التصويت";


    candidatesContainer.innerHTML =
        "";


    hideMessage(
        electionMessage
    );


    loadElectionsList();
}


/* =========================================================
   PLAYER LOGOUT
========================================================= */

function logoutPlayer() {

    clearElectionEndTimer();
    stopElectionsRefresh();

    currentPlayer =
        null;

    currentElection =
        null;

    currentElections =
        [];


    clearStoredPlayer();


    uidInput.value =
        "";

    ridInput.value =
        "";


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


    hideNavigation();
}


/* =========================================================
   VERIFY PLAYER
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
                await fetchJson(
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
                !data.valid
            ) {

                if (
                    data?.error ===
                    "UID_NOT_FOUND"
                ) {

                    showMessage(
                        message,
                        "رقم هوية الحساب غير صحيح."
                    );

                } else if (
                    data?.error ===
                    "RID_MISMATCH"
                ) {

                    showMessage(
                        message,
                        "رقم الهوية بالمملكة غير مطابق."
                    );

                } else {

                    showMessage(
                        message,
                        data?.message ||
                        "تعذر التحقق من بيانات الحساب."
                    );
                }


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


            storePlayer(
                currentPlayer
            );


            verificationCard.style.display =
                "none";

            electionCard.style.display =
                "block";


            showNavigation();


            await loadElectionsList();


        } catch (
            error
        ) {

            console.error(
                error
            );


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
   RESTORE PLAYER SESSION AFTER REFRESH
========================================================= */

async function restorePlayerSession() {

    const stored =
        getStoredPlayer();


    if (
        !stored?.uid ||
        !stored?.rid
    ) {

        return;
    }


    try {

        const {
            response,
            data
        } =
            await fetchJson(
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
                                stored.uid,

                            rid:
                                stored.rid

                        })
                }
            );


        if (
            !response.ok ||
            !data.valid
        ) {

            clearStoredPlayer();

            return;
        }


        currentPlayer = {

            uid:
                stored.uid,

            rid:
                stored.rid,

            server_id:
                data.server_id,

            nickname:
                data.nickname
        };


        verificationCard.style.display =
            "none";

        electionCard.style.display =
            "block";


        showNavigation();


        await loadElectionsList();


    } catch (
        error
    ) {

        console.error(
            "Restore player session error:",
            error
        );

        /*
         * لا نحذف الجلسة في حالة وجود
         * انقطاع مؤقت في الشبكة.
         */
    }
}


/* =========================================================
   INITIALIZATION
========================================================= */

document.addEventListener(
    "DOMContentLoaded",
    async () => {

        ensureVotingNavigation();

        const publicResultId =
            getPublicResultsElectionId();

        if (publicResultId) {

            verificationCard.style.display =
                "none";

            electionCard.style.display =
                "block";

            hideNavigation();

            await showResults(
                publicResultId,
                true
            );

            return;
        }

        await restorePlayerSession();
    }
);
