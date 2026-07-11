export interface Project {
	id: string;
	name: string;
	createdAt: number;
}

const PROJECT_LIST_KEY = "projectList";
const CURRENT_PROJECT_KEY = "currentProjectId";

export const getProjectList = (): Project[] => {
	const raw = localStorage.getItem(PROJECT_LIST_KEY);
	if (!raw) return [];
	try {
		const parsed = JSON.parse(raw);
		return Array.isArray(parsed) ? parsed : [];
	} catch {
		return [];
	}
};

const saveProjectList = (projects: Project[]): void => {
	localStorage.setItem(PROJECT_LIST_KEY, JSON.stringify(projects));
};

export const getCurrentProjectId = (): string => {
	return localStorage.getItem(CURRENT_PROJECT_KEY) || "";
};

export const setCurrentProjectId = (id: string): void => {
	localStorage.setItem(CURRENT_PROJECT_KEY, id);
};

export const createProject = (name: string): Project => {
	const projects = getProjectList();
	const project: Project = {
		id: Date.now().toString(),
		name: name.trim() || "Untitled",
		createdAt: Date.now(),
	};
	projects.push(project);
	saveProjectList(projects);
	return project;
};

export const deleteProject = (id: string): void => {
	const projects = getProjectList().filter((p) => p.id !== id);
	saveProjectList(projects);

	// Clear the project's localStorage keys
	const prefix = `project_${id}_`;
	const keysToRemove: string[] = [];
	for (let i = 0; i < localStorage.length; i++) {
		const key = localStorage.key(i);
		if (key && key.startsWith(prefix)) {
			keysToRemove.push(key);
		}
	}
	keysToRemove.forEach((key) => localStorage.removeItem(key));

	// If deleting the current project, switch to the first available or clear
	if (getCurrentProjectId() === id) {
		const next = projects[0];
		setCurrentProjectId(next ? next.id : "");
	}
};

export const renameProject = (id: string, name: string): void => {
	const projects = getProjectList();
	const target = projects.find((p) => p.id === id);
	if (target) {
		target.name = name.trim() || "Untitled";
		saveProjectList(projects);
	}
};

export const getStorageNamespace = (projectId: string): string => {
	return `project_${projectId}`;
};
