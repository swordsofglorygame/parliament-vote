const API_URL =
    "https://parliament-api.sog-parliament.workers.dev";

const PAGE_SIZE = 1000;

let adminSessionToken =
    localStorage.getItem(
        "admin_session_token"
    ) || null;

let servers = [];

let currentServerId = null;

let currentPage = 1;

let totalPlayers = 0;

let allLoadedPlayers = [];


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

function showMessage(text, type = "error") {

    const box =
        el("message");

    box.style.display =
        "block";

    box.textContent =
        text;

    if (type === "success") {

        box.style.background =
            "rgba(57,130,64,.12)";

        box.style.border =
            "1px solid rgba(119,201,126,.3)";

        box.style.color =
            "#9bdfa2";

    } else {

        box.style.background =
            "rgba(168,51,46,.12)";

        box.style.border =
            "1px solid rgba(239,143,135,.3)";

        box.style.color =
            "#ffaaa5";
    }
}

function hideMessage() {

    const box =
        el("message");

    box.style.display =
        "none";

    box.textContent =
        "";
}


/* =========================================================
   API
========================================================= */

async function apiFetch(path) {

    const response =
        await fetch(
            `${API_URL}${path}`,
            {
                headers: {
                    Authorization:
                        `Bearer ${adminSessionToken}`
                }
            }
        );

    if (
        response.status === 401
    ) {

        localStorage.removeItem(
            "admin_session_token"
        );

        localStorage.removeItem(
            "admin_email"
        );

        location.href =
            "admin.html";

        throw new Error(
            "انتهت جلسة الإدارة."
        );
    }

    return response;
}


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

            throw new Error(
                data.message ||
                "تعذر تحميل السيرفرات."
            );
        }

        servers =
            data.servers || [];

        const select =
            el("serverSelect");

        select.innerHTML = `
            <option value="">
                اختر السيرفر
            </option>
        `;

        servers
            .filter(
                server =>
                    Number(
                        server.active
                    ) === 1
            )
            .forEach(
                server => {

                    const option =
                        document.createElement(
                            "option"
                        );

                    option.value =
                        server.server_id;

                    option.textContent =
                        server.name;

                    select.appendChild(
                        option
                    );
                }
            );

    } catch (error) {

        console.error(error);

        showMessage(
            error.message ||
            "تعذر تحميل السيرفرات."
        );
    }
}


/* =========================================================
   LOAD PLAYERS
========================================================= */

async function loadPlayers() {

    if (
        !currentServerId
    ) {

        return;
    }

    const offset =
        (
            currentPage - 1
        ) * PAGE_SIZE;

    const container =
        el("tableContainer");

    container.innerHTML = `
        <div class="empty">
            جاري تحميل اللاعبين...
        </div>
    `;

    hideMessage();

    try {

        const response =
            await apiFetch(
                `/admin/players?server_id=${encodeURIComponent(
                    currentServerId
                )}&limit=${PAGE_SIZE}&offset=${offset}`
            );

        const data =
            await response.json();

        if (
            !response.ok ||
            !data.success
        ) {

            throw new Error(
                data.message ||
                "تعذر تحميل اللاعبين."
            );
        }

        totalPlayers =
            Number(
                data.total
            ) || 0;

        allLoadedPlayers =
            data.players || [];

        const server =
            data.server;

        el("serverName")
            .textContent =
            server?.name ||
            currentServerId;

        el("totalPlayers")
            .textContent =
            totalPlayers.toLocaleString(
                "en-US"
            );

        el("pageNumber")
            .textContent =
            currentPage;

        renderPlayers();

        renderPagination();

    } catch (error) {

        console.error(error);

        container.innerHTML = `
            <div class="empty">
                تعذر الوصول إلى بيانات اللاعبين.
            </div>
        `;

        showMessage(
            error.message ||
            "حدث خطأ أثناء تحميل اللاعبين."
        );
    }
}


/* =========================================================
   RENDER PLAYERS
========================================================= */

function renderPlayers() {

    const container =
        el("tableContainer");

    const query =
        el("searchInput")
            .value
            .trim()
            .toLowerCase();

    let players =
        allLoadedPlayers;

    if (query) {

        players =
            players.filter(
                player =>
                    String(
                        player.uid
                    )
                        .toLowerCase()
                        .includes(query) ||

                    String(
                        player.rid
                    )
                        .toLowerCase()
                        .includes(query) ||

                    String(
                        player.nickname
                    )
                        .toLowerCase()
                        .includes(query)
            );
    }

    if (!players.length) {

        container.innerHTML = `
            <div class="empty">
                لا توجد نتائج.
            </div>
        `;

        return;
    }

    const startNumber =
        (
            (
                currentPage - 1
            ) *
            PAGE_SIZE
        ) + 1;

    container.innerHTML = `

        <table>

            <thead>

                <tr>

                    <th>
                        #
                    </th>

                    <th>
                        UID
                    </th>

                    <th>
                        RID
                    </th>

                    <th>
                        NAME
                    </th>

                </tr>

            </thead>

            <tbody>

                ${
                    players
                        .map(
                            (
                                player,
                                index
                            ) => `

                                <tr>

                                    <td>
                                        ${
                                            startNumber +
                                            index
                                        }
                                    </td>

                                    <td dir="ltr">
                                        ${escapeHtml(
                                            player.uid
                                        )}
                                    </td>

                                    <td dir="ltr">
                                        ${escapeHtml(
                                            player.rid
                                        )}
                                    </td>

                                    <td>
                                        ${escapeHtml(
                                            player.nickname
                                        )}
                                    </td>

                                </tr>

                            `
                        )
                        .join("")
                }

            </tbody>

        </table>
    `;
}


/* =========================================================
   PAGINATION
========================================================= */

function renderPagination() {

    const container =
        el("pagination");

    const totalPages =
        Math.max(
            1,
            Math.ceil(
                totalPlayers /
                PAGE_SIZE
            )
        );

    container.innerHTML =
        "";

    const previous =
        document.createElement(
            "button"
        );

    previous.textContent =
        "السابق";

    previous.disabled =
        currentPage <= 1;

    previous.onclick =
        () => {

            if (
                currentPage <= 1
            ) {

                return;
            }

            currentPage--;

            loadPlayers();
        };

    container.appendChild(
        previous
    );


    /*
     * عرض صفحات قريبة من الصفحة الحالية
     */
    const start =
        Math.max(
            1,
            currentPage - 2
        );

    const end =
        Math.min(
            totalPages,
            currentPage + 2
        );

    for (
        let page = start;
        page <= end;
        page++
    ) {

        const button =
            document.createElement(
                "button"
            );

        button.textContent =
            page;

        if (
            page ===
            currentPage
        ) {

            button.classList.add(
                "active"
            );
        }

        button.onclick =
            () => {

                currentPage =
                    page;

                loadPlayers();
            };

        container.appendChild(
            button
        );
    }


    const next =
        document.createElement(
            "button"
        );

    next.textContent =
        "التالي";

    next.disabled =
        currentPage >=
        totalPages;

    next.onclick =
        () => {

            if (
                currentPage >=
                totalPages
            ) {

                return;
            }

            currentPage++;

            loadPlayers();
        };

    container.appendChild(
        next
    );


    el("pageInfo")
        .textContent =
        `عرض الصفحة ${currentPage} من ${totalPages} — ${
            totalPlayers.toLocaleString(
                "en-US"
            )
        } لاعب`;
}


/* =========================================================
   SERVER CHANGE
========================================================= */

el("serverSelect")
    .addEventListener(
        "change",
        () => {

            currentServerId =
                Number(
                    el("serverSelect")
                        .value
                );

            currentPage =
                1;

            el("searchInput")
                .value =
                "";

            if (
                currentServerId > 0
            ) {

                loadPlayers();

            } else {

                el("tableContainer")
                    .innerHTML = `
                        <div class="empty">
                            اختر السيرفر لعرض اللاعبين.
                        </div>
                    `;

                el("totalPlayers")
                    .textContent =
                    "0";

                el("serverName")
                    .textContent =
                    "-";

                el("pageNumber")
                    .textContent =
                    "1";

                el("pagination")
                    .innerHTML =
                    "";

                el("pageInfo")
                    .textContent =
                    "";
            }
        }
    );


/* =========================================================
   SEARCH
========================================================= */

el("searchInput")
    .addEventListener(
        "input",
        () => {

            renderPlayers();
        }
    );


/* =========================================================
   REFRESH
========================================================= */

el("refreshButton")
    .addEventListener(
        "click",
        async () => {

            if (
                !currentServerId
            ) {

                return;
            }

            await loadPlayers();
        }
    );


/* =========================================================
   INITIAL
========================================================= */

if (!adminSessionToken) {

    location.href =
        "admin.html";

} else {

    loadServers();
}
