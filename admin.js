const API_URL =
    "https://parliament-api.sog-parliament.workers.dev";


/*
|--------------------------------------------------------------------------
| SESSION
|--------------------------------------------------------------------------
|
| التوكن يعيش في ذاكرة الصفحة فقط.
| لا يتم تخزينه في localStorage أو sessionStorage.
|
*/

let adminSessionToken = null;


/*
|--------------------------------------------------------------------------
| ELEMENTS
|--------------------------------------------------------------------------
*/

const loginCard =
    document.getElementById("loginCard");

const dashboardCard =
    document.getElementById("dashboardCard");

const loginForm =
    document.getElementById("loginForm");

const loginButton =
    document.getElementById("loginButton");

const loginMessage =
    document.getElementById("loginMessage");

const adminEmailDisplay =
    document.getElementById("adminEmailDisplay");

const logoutButton =
    document.getElementById("logoutButton");

const createElectionForm =
    document.getElementById(
        "createElectionForm"
    );

const createElectionButton =
    document.getElementById(
        "createElectionButton"
    );

const createElectionMessage =
    document.getElementById(
        "createElectionMessage"
    );

const seatsInput =
    document.getElementById("seats");

const minChoicesInput =
    document.getElementById(
        "minChoices"
    );

const maxChoicesInput =
    document.getElementById(
        "maxChoices"
    );


/*
|--------------------------------------------------------------------------
| MESSAGE
|--------------------------------------------------------------------------
*/

function showMessage(
    element,
    text,
    type = "error"
) {

    element.style.display = "block";

    element.textContent = text;


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

    element.style.display =
        "none";

    element.textContent =
        "";
}


/*
|--------------------------------------------------------------------------
| UPDATE MAX CHOICES
|--------------------------------------------------------------------------
|
| لو المقاعد = 3 → أقصى اختيار 3
| لو المقاعد = 5 → أقصى اختيار 5
|
*/

function updateChoiceLimits() {

    const seats =
        Number(seatsInput.value);

    maxChoicesInput.max =
        String(seats);

    minChoicesInput.max =
        String(seats);


    if (
        Number(minChoicesInput.value) >
        seats
    ) {
        minChoicesInput.value =
            seats;
    }


    if (
        Number(maxChoicesInput.value) >
        seats
    ) {
        maxChoicesInput.value =
            seats;
    }


    if (
        Number(maxChoicesInput.value) <
        Number(minChoicesInput.value)
    ) {
        maxChoicesInput.value =
            minChoicesInput.value;
    }
}


seatsInput.addEventListener(
    "change",
    updateChoiceLimits
);


/*
|--------------------------------------------------------------------------
| LOGIN
|--------------------------------------------------------------------------
*/

loginForm.addEventListener(
    "submit",
    async (event) => {

        event.preventDefault();

        hideMessage(loginMessage);


        const email =
            document
                .getElementById(
                    "adminEmail"
                )
                .value
                .trim();

        const password =
            document
                .getElementById(
                    "adminPassword"
                )
                .value;


        if (!email) {

            showMessage(
                loginMessage,
                "أدخل البريد الإلكتروني."
            );

            return;
        }


        if (!password) {

            showMessage(
                loginMessage,
                "أدخل كلمة المرور."
            );

            return;
        }


        loginButton.disabled =
            true;

        loginButton.textContent =
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

                        body: JSON.stringify({
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
                    loginMessage,
                    data.message ||
                    "بيانات الدخول غير صحيحة."
                );

                return;
            }


            /*
             * تخزين Session Token في الذاكرة فقط
             */

            adminSessionToken =
                data.token;


            if (!adminSessionToken) {

                showMessage(
                    loginMessage,
                    "تم تسجيل الدخول ولكن لم يتم إنشاء جلسة."
                );

                return;
            }


            adminEmailDisplay.textContent =
                email;


            /*
             * إظهار Dashboard
             */

            loginCard.style.display =
                "none";

            dashboardCard.style.display =
                "block";


            /*
             * تنظيف كلمة المرور من الحقل
             */

            document
                .getElementById(
                    "adminPassword"
                )
                .value = "";


            /*
             * تحقق إضافي من الجلسة
             */

            await verifyAdminSession();


        } catch (error) {

            console.error(error);

            showMessage(
                loginMessage,
                "حدث خطأ أثناء الاتصال بخادم الإدارة."
            );

        } finally {

            loginButton.disabled =
                false;

            loginButton.textContent =
                "تسجيل الدخول";
        }
    }
);


/*
|--------------------------------------------------------------------------
| VERIFY SESSION
|--------------------------------------------------------------------------
*/

async function verifyAdminSession() {

    if (!adminSessionToken) {
        return false;
    }


    try {

        const response =
            await fetch(
                `${API_URL}/admin/test`,
                {
                    method: "GET",

                    headers: {
                        "Authorization":
                            `Bearer ${adminSessionToken}`
                    }
                }
            );


        const data =
            await response.json();


        if (
            !response.ok ||
            !data.success
        ) {

            adminSessionToken =
                null;

            dashboardCard.style.display =
                "none";

            loginCard.style.display =
                "block";

            showMessage(
                loginMessage,
                "انتهت جلسة الإدارة. يرجى تسجيل الدخول مرة أخرى."
            );

            return false;
        }


        return true;


    } catch (error) {

        console.error(error);

        return false;
    }
}


/*
|--------------------------------------------------------------------------
| LOGOUT
|--------------------------------------------------------------------------
*/

logoutButton.addEventListener(
    "click",
    async () => {

        if (!adminSessionToken) {
            return;
        }


        logoutButton.disabled =
            true;


        try {

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

        } catch (error) {

            console.error(error);

        } finally {

            adminSessionToken =
                null;

            dashboardCard.style.display =
                "none";

            loginCard.style.display =
                "block";

            loginButton.disabled =
                false;

            logoutButton.disabled =
                false;
        }
    }
);


/*
|--------------------------------------------------------------------------
| CREATE ELECTION
|--------------------------------------------------------------------------
*/

createElectionForm.addEventListener(
    "submit",
    async (event) => {

        event.preventDefault();

        hideMessage(
            createElectionMessage
        );


        /*
         * تأكد أن الجلسة ما زالت صالحة
         */

        const sessionValid =
            await verifyAdminSession();


        if (!sessionValid) {
            return;
        }


        const serverId =
            Number(
                document
                    .getElementById(
                        "serverId"
                    )
                    .value
            );


        const seats =
            Number(
                seatsInput.value
            );


        const minChoices =
            Number(
                minChoicesInput.value
            );


        const maxChoices =
            Number(
                maxChoicesInput.value
            );


        const startInput =
            document
                .getElementById(
                    "startAt"
                )
                .value;


        const endInput =
            document
                .getElementById(
                    "endAt"
                )
                .value;


        const showResults =
            document
                .getElementById(
                    "showResults"
                )
                .checked;


        /*
         * Validation
         */

        if (!serverId) {

            showMessage(
                createElectionMessage,
                "اختر السيرفر."
            );

            return;
        }


        if (
            seats !== 3 &&
            seats !== 5
        ) {

            showMessage(
                createElectionMessage,
                "عدد المقاعد يجب أن يكون 3 أو 5."
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
                createElectionMessage,

                `يجب أن تكون الاختيارات من 1 إلى ${seats}.`
            );

            return;
        }


        if (
            !startInput ||
            !endInput
        ) {

            showMessage(
                createElectionMessage,
                "حدد وقت البداية والنهاية."
            );

            return;
        }


        /*
         * datetime-local يعطي القيمة بدون timezone.
         *
         * نحن نعاملها صراحة على أنها UTC.
         */

        const startAt =
            `${startInput}:00Z`;

        const endAt =
            `${endInput}:00Z`;


        if (
            Number.isNaN(
                Date.parse(startAt)
            ) ||
            Number.isNaN(
                Date.parse(endAt)
            )
        ) {

            showMessage(
                createElectionMessage,
                "صيغة التاريخ غير صحيحة."
            );

            return;
        }


        if (
            Date.parse(startAt) >=
            Date.parse(endAt)
        ) {

            showMessage(
                createElectionMessage,
                "وقت البداية يجب أن يكون قبل وقت النهاية."
            );

            return;
        }


        createElectionButton.disabled =
            true;

        createElectionButton.textContent =
            "جاري إنشاء الانتخابات...";


        try {

            const response =
                await fetch(
                    `${API_URL}/admin/election/create`,
                    {
                        method: "POST",

                        headers: {
                            "Content-Type":
                                "application/json",

                            "Authorization":
                                `Bearer ${adminSessionToken}`
                        },

                        body: JSON.stringify({

                            server_id:
                                serverId,

                            seats:
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
                response.status === 401
            ) {

                adminSessionToken =
                    null;

                dashboardCard.style.display =
                    "none";

                loginCard.style.display =
                    "block";

                showMessage(
                    loginMessage,
                    "انتهت جلسة الإدارة. سجّل الدخول مرة أخرى."
                );

                return;
            }


            if (
                !response.ok ||
                !data.success
            ) {

                showMessage(
                    createElectionMessage,
                    data.message ||
                    "تعذر إنشاء الانتخابات."
                );

                return;
            }


            showMessage(
                createElectionMessage,

                `تم إنشاء الانتخابات بنجاح.
رقم الانتخابات: ${data.election.election_id}
الحالة: Draft`,

                "success"
            );


            /*
             * تنظيف بعض الحقول
             */

            document
                .getElementById(
                    "serverId"
                )
                .value = "";


            document
                .getElementById(
                    "startAt"
                )
                .value = "";


            document
                .getElementById(
                    "endAt"
                )
                .value = "";


        } catch (error) {

            console.error(error);

            showMessage(
                createElectionMessage,
                "حدث خطأ أثناء الاتصال بخادم الإدارة."
            );

        } finally {

            createElectionButton.disabled =
                false;

            createElectionButton.textContent =
                "إنشاء الانتخابات";
        }
    }
);


/*
|--------------------------------------------------------------------------
| INITIAL SETUP
|--------------------------------------------------------------------------
*/

updateChoiceLimits();
