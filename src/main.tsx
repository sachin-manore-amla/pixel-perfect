import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

const originalFetch = window.fetch.bind(window);

window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
	const requestUrl = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
	const isApiCall = requestUrl.includes("/api/");

	if (!isApiCall) {
		return originalFetch(input, init);
	}

	try {
		const rawConfig = localStorage.getItem("jira_config");
		if (!rawConfig) {
			return originalFetch(input, init);
		}

		const parsed = JSON.parse(rawConfig) as { instanceUrl?: string; email?: string; apiToken?: string };
		if (!parsed.instanceUrl || !parsed.email || !parsed.apiToken) {
			return originalFetch(input, init);
		}

		const headers = new Headers(init?.headers || (input instanceof Request ? input.headers : undefined));
		headers.set("X-Jira-Url", parsed.instanceUrl);
		headers.set("X-Jira-Email", parsed.email);
		headers.set("X-Jira-Token", parsed.apiToken);

		return originalFetch(input, { ...init, headers });
	} catch {
		return originalFetch(input, init);
	}
};

createRoot(document.getElementById("root")!).render(<App />);
