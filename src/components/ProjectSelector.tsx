import React, { useState, useContext, useEffect, useRef } from "react";
import { ProjectContext } from "../App";
import {
	getProjectList,
	createProject,
	deleteProject,
	renameProject,
	getStorageNamespace,
} from "../utils/projectStore";
import { clearAllImageStores } from "../utils/imageStore";

const ProjectSelector: React.FC = () => {
	const { projectId, switchProject } = useContext(ProjectContext);

	const [isOpen, setIsOpen] = useState(false);
	const [projects, setProjects] = useState(() => getProjectList());
	const [editingId, setEditingId] = useState<string | null>(null);
	const [editName, setEditName] = useState("");
	const [newName, setNewName] = useState("");
	const [showNewInput, setShowNewInput] = useState(false);
	const dropdownRef = useRef<HTMLDivElement>(null);

	const currentProject = projects.find((p) => p.id === projectId);

	// Refresh project list when dropdown opens
	useEffect(() => {
		if (isOpen) {
			setProjects(getProjectList());
		}
	}, [isOpen]);

	// Close dropdown on outside click
	useEffect(() => {
		const handleClick = (e: MouseEvent) => {
			if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
				setIsOpen(false);
				setEditingId(null);
				setShowNewInput(false);
			}
		};
		if (isOpen) {
			document.addEventListener("mousedown", handleClick);
		}
		return () => document.removeEventListener("mousedown", handleClick);
	}, [isOpen]);

	const handleSelect = (id: string) => {
		if (id !== projectId) {
			switchProject(id);
		}
		setIsOpen(false);
	};

	const handleCreate = () => {
		const name = newName.trim() || "New Project";
		const project = createProject(name);
		setProjects(getProjectList());
		setNewName("");
		setShowNewInput(false);
		switchProject(project.id);
		setIsOpen(false);
	};

	const handleDelete = async (id: string, e: React.MouseEvent) => {
		e.stopPropagation();

		const target = projects.find((p) => p.id === id);
		const name = target?.name || "this project";
		const confirmed = window.confirm(
			`Delete "${name}" and all its images? This cannot be undone.`
		);
		if (!confirmed) return;

		// Clear IndexedDB data for this project
		const namespace = getStorageNamespace(id);
		try {
			await clearAllImageStores(namespace);
		} catch (err) {
			console.error("Failed to clear IndexedDB for project:", err);
		}

		// Clear localStorage data for this project
		const prefix = `${namespace}_`;
		const keysToRemove: string[] = [];
		for (let i = 0; i < localStorage.length; i++) {
			const key = localStorage.key(i);
			if (key && key.startsWith(prefix)) {
				keysToRemove.push(key);
			}
		}
		keysToRemove.forEach((key) => localStorage.removeItem(key));

		const wasCurrent = id === projectId;
		deleteProject(id);
		const updated = getProjectList();
		setProjects(updated);

		if (wasCurrent) {
			if (updated.length > 0) {
				switchProject(updated[0].id);
			}
		}
	};

	const startRename = (id: string, currentName: string, e: React.MouseEvent) => {
		e.stopPropagation();
		setEditingId(id);
		setEditName(currentName);
	};

	const handleRename = (id: string, e: React.MouseEvent | React.KeyboardEvent) => {
		e.stopPropagation();
		const name = editName.trim();
		if (name) {
			renameProject(id, name);
			setProjects(getProjectList());
		}
		setEditingId(null);
	};

	const handleRenameKeyDown = (id: string, e: React.KeyboardEvent) => {
		if (e.key === "Enter") {
			handleRename(id, e);
		} else if (e.key === "Escape") {
			e.stopPropagation();
			setEditingId(null);
		}
	};

	const handleNewKeyDown = (e: React.KeyboardEvent) => {
		if (e.key === "Enter") {
			handleCreate();
		} else if (e.key === "Escape") {
			setShowNewInput(false);
			setNewName("");
		}
	};

	return (
		<div className="mb-4 relative" ref={dropdownRef}>
			<button
				onClick={() => setIsOpen(!isOpen)}
				className="flex items-center gap-2 bg-stone-700 hover:bg-stone-600 text-white px-4 py-2 rounded-md transition-colors"
			>
				<span className="text-gray-400 text-sm">Project:</span>
				<span className="font-semibold">{currentProject?.name || "Unknown"}</span>
				<svg
					className={`w-4 h-4 transition-transform ${isOpen ? "rotate-180" : ""}`}
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
				>
					<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
				</svg>
			</button>

			{isOpen && (
				<div className="absolute top-full mt-1 left-0 w-72 bg-zinc-800 border border-zinc-700 rounded-md shadow-2xl z-50 overflow-hidden">
					<div className="max-h-64 overflow-y-auto">
						{projects.map((project) => (
							<div
								key={project.id}
								onClick={() =>
									editingId !== project.id ? handleSelect(project.id) : undefined
								}
								className={`flex items-center justify-between px-3 py-2 cursor-pointer hover:bg-zinc-700 transition-colors ${
									project.id === projectId ? "bg-zinc-700" : ""
								}`}
							>
								{editingId === project.id ? (
									<input
										type="text"
										value={editName}
										onChange={(e) => setEditName(e.target.value)}
										onKeyDown={(e) => handleRenameKeyDown(project.id, e)}
										onClick={(e) => e.stopPropagation()}
										className="flex-1 bg-zinc-600 text-white px-2 py-1 rounded text-sm border border-zinc-500 focus:outline-none focus:border-indigo-400"
										autoFocus
										onBlur={(e) => handleRename(project.id, e as any)}
									/>
								) : (
									<span className="text-white text-sm flex-1 truncate">
										{project.name}
										{project.id === projectId && (
											<span className="ml-2 text-xs text-indigo-400">(current)</span>
										)}
									</span>
								)}

								{editingId !== project.id && (
									<div className="flex items-center gap-1 ml-2">
										<button
											onClick={(e) => startRename(project.id, project.name, e)}
											className="text-gray-400 hover:text-white p-1"
											title="Rename"
										>
											<svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
												<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
													d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
											</svg>
										</button>
										<button
											onClick={(e) => handleDelete(project.id, e)}
											className="text-gray-400 hover:text-red-400 p-1"
											title="Delete"
										>
											<svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
												<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
													d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
											</svg>
										</button>
									</div>
								)}
							</div>
						))}
					</div>

					<div className="border-t border-zinc-700 p-2">
						{showNewInput ? (
							<div className="flex items-center gap-2">
								<input
									type="text"
									value={newName}
									onChange={(e) => setNewName(e.target.value)}
									onKeyDown={handleNewKeyDown}
									placeholder="Project name..."
									className="flex-1 bg-zinc-600 text-white px-2 py-1 rounded text-sm border border-zinc-500 focus:outline-none focus:border-indigo-400"
									autoFocus
								/>
								<button
									onClick={handleCreate}
									className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs px-2 py-1 rounded"
								>
									Create
								</button>
							</div>
						) : (
							<button
								onClick={() => setShowNewInput(true)}
								className="w-full text-left text-sm text-gray-400 hover:text-white px-2 py-1.5 hover:bg-zinc-700 rounded transition-colors"
							>
								+ New Project
							</button>
						)}
					</div>
				</div>
			)}
		</div>
	);
};

export default ProjectSelector;
