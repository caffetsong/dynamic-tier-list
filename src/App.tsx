import React, { useState, useEffect } from "react";
import "./index.css";
import TierList from "./components/TierList";
import ImageHolder from "./components/ImageHolder";
import { AddTierButton } from "./components/TierModal";
import ProjectSelector from "./components/ProjectSelector";
import { migrateToProjectSystem } from "./utils/imageStore";
import { getProjectList, getCurrentProjectId, setCurrentProjectId, createProject } from "./utils/projectStore";

interface Style {
	ratio: string;
	size: number;
	quality: number;
	pasteScaleMode: "fixed" | "preserve";
}

interface StyleState {
	style: Style;
	setStyle: React.Dispatch<React.SetStateAction<Style>>;
}

interface Tier {
	id: number;
	color: string;
	tierLabel: string;
}

interface TierState {
	tiers: Tier[];
	setTiers: React.Dispatch<React.SetStateAction<Tier[]>>;
}

interface ProjectState {
	projectId: string;
	namespace: string;
	switchProject: (newProjectId: string) => void;
}

export const StylingContext = React.createContext<StyleState>({} as StyleState);
export const TierContext = React.createContext<TierState>({} as TierState);
export const ProjectContext = React.createContext<ProjectState>({} as ProjectState);

interface AppInnerProps {
	projectId: string;
	namespace: string;
	switchProject: (newProjectId: string) => void;
}

const AppInner: React.FC<AppInnerProps> = ({ projectId, namespace, switchProject }) => {
	const normalizeStyle = (value: unknown): Style => {
		const fallback: Style = {
			ratio: "preserve",
			size: 80,
			quality: 100,
			pasteScaleMode: "preserve",
		};

		if (typeof value !== "object" || value === null) {
			return fallback;
		}

		const styleValue = value as Partial<Style>;

		return {
			ratio: typeof styleValue.ratio === "string" ? styleValue.ratio : fallback.ratio,
			size: typeof styleValue.size === "number" ? styleValue.size : fallback.size,
			quality: typeof styleValue.quality === "number" ? styleValue.quality : fallback.quality,
			pasteScaleMode:
				styleValue.pasteScaleMode === "preserve" || styleValue.pasteScaleMode === "fixed"
					? styleValue.pasteScaleMode
					: fallback.pasteScaleMode,
		};
	};

	const tiersKey = `${namespace}_tiers`;
	const styleKey = `${namespace}_style`;

	const [style, setStyle] = useState<Style>(() => {
		const storedStyle = localStorage.getItem(styleKey);
		if (storedStyle) {
			if (storedStyle.startsWith("{")) {
				return normalizeStyle(JSON.parse(storedStyle));
			} else {
				// MIGRATION: OLD STYLE FORMAT
				const ratio = storedStyle;
				return { ratio: ratio, size: 80, quality: 100, pasteScaleMode: "preserve" };
			}
		} else {
			return { ratio: "preserve", size: 80, quality: 100, pasteScaleMode: "preserve" };
		}
	});

	const [tiers, setTiers] = useState<Tier[]>(() => {
		const storedTiers = localStorage.getItem(tiersKey);

		if (storedTiers) {
			const parsedTiers: any[] = JSON.parse(storedTiers);

			// MIGRATION: ID USED TO REPRESENT TIER LABEL
			// IDENTIFIER USED COMBINATION OF COLOR AND LABEL
			// WE WILL MIMIC THE OLD BEHAVIOR FOR OLDER SAVES (OLD SAVES USE THIS FOR IMAGE LOOKUP)
			// FUTURE SAVES WILL USE NEW FORMAT OF DATE.NOW()
			// this is my first time writing migration code and writing comments about it :3
			// if you see this DM me I'm convinced nobody will ever read this
			const isOldFormat = parsedTiers.some((tier) => !("tierLabel" in tier));
			if (isOldFormat) {
				return parsedTiers.map((tier, index) => ({
					color: tier.color,
					tierLabel: tier.id,
					id: `${tier.color}_${tier.id}`,
				}));
			} else {
				return parsedTiers;
			}
		}

		return [
			{ color: "#FF7F7F", tierLabel: "S", id: 1 },
			{ color: "#FFBF7F", tierLabel: "A", id: 2 },
			{ color: "#FFDF80", tierLabel: "B", id: 3 },
			{ color: "#FFFF7F", tierLabel: "C", id: 4 },
			{ color: "#BFFF7F", tierLabel: "D", id: 5 },
		];
	});

	useEffect(() => {
		localStorage.setItem(tiersKey, JSON.stringify(tiers));
	}, [tiers, tiersKey]);

	useEffect(() => {
		localStorage.setItem(styleKey, JSON.stringify(style));
	}, [style, styleKey]);

	return (
		<ProjectContext.Provider value={{ projectId, namespace, switchProject }}>
			<StylingContext.Provider value={{ style, setStyle }}>
				<TierContext.Provider value={{ tiers, setTiers }}>
					<div className="p-8 min-h-[100vh] bg-stone-800">
						<ProjectSelector />
						<TierList />
						<AddTierButton />
						<ImageHolder />
					</div>
				</TierContext.Provider>
			</StylingContext.Provider>
		</ProjectContext.Provider>
	);
};

const App = () => {
	const [appState, setAppState] = useState<{ projectId: string; namespace: string } | null>(null);

	// Called from ProjectSelector via ProjectContext when user switches projects
	const switchToProject = (newProjectId: string) => {
		setCurrentProjectId(newProjectId);
		setAppState({ projectId: newProjectId, namespace: `project_${newProjectId}` });
	};

	useEffect(() => {
		const init = async () => {
			const DEFAULT_PROJECT_ID = "default";
			const DEFAULT_NAMESPACE = `project_${DEFAULT_PROJECT_ID}`;

			// Check if project system already exists
			const projectList = getProjectList();

			if (projectList.length === 0) {
				// --- First-time migration: move old data into default project ---

				// Migrate localStorage keys
				const oldTiers = localStorage.getItem("tiers");
				const oldStyle = localStorage.getItem("style");

				if (oldTiers) {
					localStorage.setItem(`${DEFAULT_NAMESPACE}_tiers`, oldTiers);
				}
				if (oldStyle) {
					localStorage.setItem(`${DEFAULT_NAMESPACE}_style`, oldStyle);
				}

				// Migrate IndexedDB images to namespaced keys
				await migrateToProjectSystem(DEFAULT_NAMESPACE);

				// Create default project
				createProject("Default");
				setCurrentProjectId(DEFAULT_PROJECT_ID);

				// Clean up old un-namespaced localStorage keys
				localStorage.removeItem("tiers");
				localStorage.removeItem("style");
			}

			const currentId = getCurrentProjectId() || DEFAULT_PROJECT_ID;
			setAppState({ projectId: currentId, namespace: `project_${currentId}` });
		};

		init();
	}, []);

	if (!appState) {
		return (
			<div className="p-8 min-h-[100vh] bg-stone-800 flex items-center justify-center">
				<p className="text-gray-400 text-lg">Loading...</p>
			</div>
		);
	}

	return (
		<AppInner
			key={appState.projectId}
			projectId={appState.projectId}
			namespace={appState.namespace}
			switchProject={switchToProject}
		/>
	);
};

export default App;
