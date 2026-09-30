import { QueryClient } from '@tanstack/react-query';


export const queryClientInstance = new QueryClient({
	defaultOptions: {
		queries: {
			refetchOnWindowFocus: false,
			retry: 1,
			// Frischhaltezeit: Daten gelten 30 s als aktuell. Jede Speicherung aus der App
			// markiert sie sofort als veraltet (siehe auditWrapper).
			staleTime: 30 * 1000,
		},
	},
});

// Bei jedem Neuladen im Entwicklungsmodus alle Abfragen samt Zeitgeber leeren,
// damit sich keine alten Aktualisierungsschleifen ansammeln.
if (import.meta.hot) {
	import.meta.hot.dispose(() => queryClientInstance.clear());
}