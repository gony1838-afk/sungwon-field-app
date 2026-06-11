function qs(selector) {
  return document.querySelector(selector);
}

async function loginAdmin() {
  try {
    const password = qs("#adminPassword").value;
    const response = await fetch("/api/admin/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password })
    });
    const result = await response.json();
    if (!result.ok) {
      qs("#loginStatus").textContent = "비밀번호가 맞지 않습니다.";
      qs("#loginStatus").className = "status error";
      return;
    }
    sessionStorage.setItem("sungwonAdminUnlocked", "1");
    window.location.href = "/admin-dashboard.html";
  } catch (error) {
    qs("#loginStatus").textContent = error.message;
    qs("#loginStatus").className = "status error";
  }
}

qs("#adminLogin").addEventListener("click", loginAdmin);
qs("#adminPassword").addEventListener("keydown", event => {
  if (event.key === "Enter") loginAdmin();
});
