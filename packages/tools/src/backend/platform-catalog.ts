// Platform catalog port — read-only model and timezone reference data.

interface ModelDto {
    id?: string;
    created?: number;
    object?: string;
    owned_by?: string;
}
interface ModelListDto {
    data?: ModelDto[];
    object?: string;
}
interface TimezoneListDto {
    data: string[];
}

export interface PlatformCatalogBackend {
    listModels(): Promise<ModelListDto>;
    listTimezones(): Promise<TimezoneListDto>;
}
