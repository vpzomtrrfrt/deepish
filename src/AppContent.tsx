import { Tooltip } from "@base-ui-components/react/tooltip";
import { Redirect, Route } from "wouter-preact";

import ChatPage from "./pages/chat";
import LoginPage from "./pages/login";
import { useConnectionContext } from "./util/connection";
import { themeCSS } from "./util/theme";

export default function AppContent() {
	return <div class="appWrapper" style={themeCSS.light}>
		<Tooltip.Provider>
			<Route path="/" component={RootPage} />
			<Route path="/chat" component={ChatPage} nest />
			<Route path="/login" component={LoginPage} />
		</Tooltip.Provider>
	</div>;
}

function RootPage() {
	const conn = useConnectionContext();

	if(conn.accounts.length > 0) {
		return <ChatPage />;
	}
	else {
		return <Redirect to="~/login" />;
	}
}
