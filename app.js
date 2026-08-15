const API_URL = "https://parliament-api.sog-parliament.workers.dev";

const verificationCard = document.getElementById("verificationCard");
const electionCard = document.getElementById("electionCard");

const form = document.getElementById("verificationForm");
const uidInput = document.getElementById("uid");
const ridInput = document.getElementById("rid");
const verifyButton = document.getElementById("verifyButton");

const message = document.getElementById("message");

const electionTitle = document.getElementById("electionTitle");
const electionInfo = document.getElementById("electionInfo");
const candidatesContainer = document.getElementById("candidatesContainer");
const electionMessage = document.getElementById("electionMessage");

let currentPlayer = null;
let currentElection = null;


function showMessage(element, text, type = "error") {
    element.style.display = "block";
    element.textContent = text;

    if (type === "success") {
        element.style.background = "rgba(46, 125, 50, 0.15)";
        element.style.border = "1px solid rgba(76, 175, 80, 0.4)";
        element.style.color = "#9be7a0";
    } else {
        element.style.background = "rgba(198, 40, 40, 0.15)";
        element.style.border = "1px solid rgba(239, 83, 80, 0.4)";
        element.style.color = "#ff9d9d";
    }
}


function hideMessage(element) {
    element.style.display = "none";
    element.textContent = "";
}


async function loadElection(serverId) {
    electionTitle.textContent = `انتخابات برلمان السيرفر ${serverId}`;
    electionInfo.textContent = "جاري تحميل بيانات الانتخابات...";
    candidatesContainer.innerHTML = "";
    hideMessage(electionMessage);

    try {
        const response = await fetch(
            `${API_URL}/election?server_id=${encodeURIComponent(serverId)}`
        );

        const data = await response.json();

        if (!response.ok) {
            showMessage(
                electionMessage,
                "تعذر تحميل بيانات الانتخابات."
            );
            return;
        }

        if (!data.open) {
            electionInfo.textContent =
                "لا توجد انتخابات مفتوحة حاليًا لهذا السيرفر.";

            showMessage(
                electionMessage,
                "لا توجد انتخابات مفتوحة حاليًا."
            );

            return;
        }

        currentElection = data.election;

        electionInfo.textContent =
            `عدد المقاعد: ${data.election.seats} — يمكنك اختيار من ${data.election.min_choices} إلى ${data.election.max_choices} مرشحين.`;

        const candidates = data.candidates || [];

        if (candidates.length === 0) {
            showMessage(
                electionMessage,
                "لا يوجد مرشحون مسجلون في هذه الانتخابات حاليًا."
            );
            return;
        }

        candidates.forEach(candidate => {
            const candidateBox = document.createElement("div");

            candidateBox.style.marginBottom = "12px";
            candidateBox.style.padding = "15px";
            candidateBox.style.border = "1px solid rgba(190, 145, 70, 0.35)";
            candidateBox.style.borderRadius = "12px";
            candidateBox.style.background = "rgba(255, 255, 255, 0.02)";

            const label = document.createElement("label");

            label.style.display = "flex";
            label.style.alignItems = "center";
            label.style.gap = "12px";
            label.style.cursor = "pointer";
            label.style.margin = "0";

            const checkbox = document.createElement("input");

            checkbox.type = "checkbox";
            checkbox.name = "candidate";
            checkbox.value = candidate.candidate_id;
            checkbox.style.width = "20px";
            checkbox.style.height = "20px";
            checkbox.style.cursor = "pointer";

            const name = document.createElement("span");

            name.textContent = candidate.nickname;
            name.style.fontSize = "16px";
            name.style.color = "#f5ead7";

            label.appendChild(checkbox);
            label.appendChild(name);

            candidateBox.appendChild(label);
            candidatesContainer.appendChild(candidateBox);
        });

        const voteButton = document.createElement("button");

        voteButton.type = "button";
        voteButton.id = "voteButton";
        voteButton.textContent = "تأكيد التصويت";

        voteButton.addEventListener("click", submitVote);

        candidatesContainer.appendChild(voteButton);

    } catch (error) {
        console.error(error);

        electionInfo.textContent =
            "تعذر الاتصال بخادم الانتخابات.";

        showMessage(
            electionMessage,
            "حدث خطأ أثناء تحميل الانتخابات."
        );
    }
}


async function submitVote() {
    if (!currentPlayer || !currentElection) {
        showMessage(
            electionMessage,
            "بيانات التصويت غير مكتملة."
        );
        return;
    }

    const selected = Array.from(
        document.querySelectorAll('input[name="candidate"]:checked')
    );

    const selectedIds = selected.map(
        checkbox => Number(checkbox.value)
    );

    if (
        selectedIds.length < currentElection.min_choices ||
        selectedIds.length > currentElection.max_choices
    ) {
        showMessage(
            electionMessage,
            `يجب اختيار من ${currentElection.min_choices} إلى ${currentElection.max_choices} مرشحين.`
        );
        return;
    }

    const voteButton = document.getElementById("voteButton");

    if (voteButton) {
        voteButton.disabled = true;
        voteButton.textContent = "جاري تسجيل التصويت...";
    }

    hideMessage(electionMessage);

    try {
        const response = await fetch(`${API_URL}/vote`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                uid: currentPlayer.uid,
                rid: currentPlayer.rid,
                election_id: currentElection.election_id,
                candidate_ids: selectedIds
            })
        });

        const data = await response.json();

        if (!response.ok || !data.success) {

            if (data.error === "ALREADY_VOTED") {
                showMessage(
                    electionMessage,
                    "لقد قمت بالتصويت بالفعل في هذه الانتخابات."
                );
            } else if (data.error === "RID_MISMATCH") {
                showMessage(
                    electionMessage,
                    "تعذر التحقق من بيانات الحساب."
                );
            } else if (data.error === "ELECTION_CLOSED") {
                showMessage(
                    electionMessage,
                    "انتهت فترة التصويت."
                );
            } else {
                showMessage(
                    electionMessage,
                    data.message || "تعذر تسجيل التصويت."
                );
            }

            if (voteButton) {
                voteButton.disabled = false;
                voteButton.textContent = "تأكيد التصويت";
            }

            return;
        }

        // نجاح التصويت
        candidatesContainer.innerHTML = "";

        electionInfo.textContent =
            "تم تسجيل صوتك بنجاح. لا يمكن تعديل التصويت بعد إرساله.";

        showMessage(
            electionMessage,
            "✅ تم تسجيل تصويتك بنجاح.",
            "success"
        );

    } catch (error) {
        console.error(error);

        showMessage(
            electionMessage,
            "حدث خطأ أثناء الاتصال بخادم التصويت."
        );

        if (voteButton) {
            voteButton.disabled = false;
            voteButton.textContent = "تأكيد التصويت";
        }
    }
}


form.addEventListener("submit", async (event) => {
    event.preventDefault();

    hideMessage(message);

    const uid = uidInput.value.trim();
    const rid = ridInput.value.trim();

    if (!uid) {
        showMessage(message, "يرجى إدخال رقم هوية الحساب.");
        return;
    }

    if (!rid) {
        showMessage(message, "يرجى إدخال رقم الهوية بالمملكة.");
        return;
    }

    verifyButton.disabled = true;
    verifyButton.textContent = "جاري التحقق...";

    try {
        const response = await fetch(`${API_URL}/verify`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                uid,
                rid
            })
        });

        const data = await response.json();

        if (!response.ok || !data.valid) {

            if (data.error === "UID_NOT_FOUND") {
                showMessage(
                    message,
                    "رقم هوية الحساب غير صحيح."
                );

            } else if (data.error === "RID_MISMATCH") {
                showMessage(
                    message,
                    "رقم الهوية بالمملكة غير مطابق."
                );

            } else {
                showMessage(
                    message,
                    data.message || "تعذر التحقق من بيانات الحساب."
                );
            }

            return;
        }

        currentPlayer = {
            uid,
            rid,
            server_id: data.server_id,
            nickname: data.nickname
        };

        setTimeout(() => {
            verificationCard.style.display = "none";
            electionCard.style.display = "block";

            loadElection(data.server_id);
        }, 500);

    } catch (error) {
        console.error(error);

        showMessage(
            message,
            "حدث خطأ أثناء الاتصال بالخادم."
        );

    } finally {
        verifyButton.disabled = false;
        verifyButton.textContent = "متابعة";
    }
});
