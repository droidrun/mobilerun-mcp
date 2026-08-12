// Platform catalog port — read-only reference data. `app_event_types` is
// intentionally NOT duplicated here: it already exists as
// WorkflowsBackend.listAppEventCatalog (used by
// list_workflow_resources(resource="app_event_catalog")); the
// platform_catalog tool dispatches to that same backend method for
// catalog="app_event_types" instead of adding a second port for identical
// data.
export interface ModelDto {
    id?: string;
    created?: number;
    object?: string;
    owned_by?: string;
}
export interface ModelListDto {
    data?: ModelDto[];
    object?: string;
}
export interface TimezoneListDto {
    data: string[];
}

export interface PlatformCatalogBackend {
    listModels(): Promise<ModelListDto>;
    listTimezones(): Promise<TimezoneListDto>;
}
