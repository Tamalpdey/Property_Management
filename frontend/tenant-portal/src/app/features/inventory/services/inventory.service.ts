import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { ApiResponse, CreateInventoryCategoryRequest, CreateInventoryItemRequest, InventoryCatalog, InventoryCategory, InventoryItem } from '@lorne/contracts';
import { map } from 'rxjs';
import { environment } from '../../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class InventoryService {
  private readonly http = inject(HttpClient);

  catalog() {
    return this.http
      .get<ApiResponse<InventoryCatalog>>(`${environment.apiBaseUrl}/tenant/inventory`)
      .pipe(map((response) => response.data));
  }

  createCategory(request: CreateInventoryCategoryRequest) {
    return this.http
      .post<ApiResponse<InventoryCategory>>(`${environment.apiBaseUrl}/tenant/inventory/categories`, request)
      .pipe(map((response) => response.data));
  }

  createItem(request: CreateInventoryItemRequest) {
    return this.http
      .post<ApiResponse<InventoryItem>>(`${environment.apiBaseUrl}/tenant/inventory/items`, request)
      .pipe(map((response) => response.data));
  }
}
