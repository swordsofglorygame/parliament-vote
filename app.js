const API_URL = "https://parliament-api.sog-parliament.workers.dev";

const form = document.getElementById("verificationForm");
const uidInput = document.getElementById("uid");
const ridInput = document.getElementById("rid");
const message = document.getElementById("message");

function showMessage(text, type = "error") {
    message.style.display = "block";
    message.textContent = text;

    if (type === "success") {
        message.style.background = "rgba(46, 125, 50, 0.15)";
        message.style.border = "1px solid rgba(76, 175, 80, 0.4)";
        message.style.color = "#9be7a0";
    } else {
        message.style.background = "rgba(198, 40, 40, 0.15)";
        message.style.border = "1px solid rgba(239, 83, 80, 0.4)";
        message.style.color = "#ff9d9d";
    }
}

form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const uid = uidInput.value.trim();
    const rid = ridInput.value.trim();

    if (!uid) {
        showMessage("يرجى إدخال رقم هوية الحساب.");
        return;
    }

    if (!rid) {
        showMessage("يرجى إدخال رقم الهوية بالمملكة.");
        return;
    }

    showMessage("جاري التحقق من بيانات الحساب...", "success");

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
                showMessage("رقم هوية الحساب غير صحيح.");
                return;
            }

            if (data.error === "RID_MISMATCH") {
                showMessage("رقم الهوية بالمملكة غير مطابق.");
                return;
            }

            showMessage(data.message || "تعذر التحقق من بيانات الحساب.");
            return;
        }

        showMessage(
            `تم التحقق بنجاح — السيرفر: ${data.server_id}`,
            "success"
        );

        console.log("Verified player:", data);

    } catch (error) {
        console.error(error);
        showMessage(
            "حدث خطأ أثناء الاتصال بالخادم. حاول مرة أخرى."
        );
    }
});
