import { QueryClient } from '@tanstack/react-query';


export const queryClientInstance = new QueryClient({
	defaultOptions: {
		queries: {
			refetchOnWindowFocus: false,
			retry: 1,
		},
	},
});

// Bei jedem Neuladen im Entwicklungsmodus alle Abfragen samt Zeitgeber leeren,
// damit sich keine alten Aktualisierungsschleifen ansammeln.
if (import.meta.hot) {
	import.meta.hot.dispose(() => queryClientInstance.clear());
}