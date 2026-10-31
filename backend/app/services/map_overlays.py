"""MapLibre sources/layers for JigMap data overlays, built from the map_layers registry."""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import BathymetryDataset, MapLayer
from app.services.basemap import MALDIVES_BOUNDS

_B = MALDIVES_BOUNDS
BOUNDS = [_B["west"], _B["south"], _B["east"], _B["north"]]

# depth (m) -> colour, used by the contour lines
CONTOUR_COLOUR = [
    "interpolate",
    ["linear"],
    ["get", "depth_m"],
    10,
    "#b2ebf2",
    50,
    "#4dd0e1",
    200,
    "#26c6da",
    1000,
    "#0097a7",
    3000,
    "#006064",
]


def layer_meta(layer: MapLayer, style_layer_ids: list[str]) -> dict:
    return {
        "slug": layer.slug,
        "name": layer.name,
        "style_layer_ids": style_layer_ids,
        "data_kind": layer.data_kind.value,
        "description": layer.description,
        "attribution": layer.attribution,
        "data_updated_at": layer.data_updated_at.isoformat() if layer.data_updated_at else None,
        "default_visible": layer.default_visible,
        "default_opacity": layer.default_opacity,
        "supports_opacity": layer.layer_type == "raster",
    }


async def bathymetry_overlays(db: AsyncSession, api_base: str) -> dict | None:
    ds = await db.scalar(select(BathymetryDataset).where(BathymetryDataset.is_active))
    if ds is None:
        return None
    layers = {
        lyr.slug: lyr
        for lyr in (
            await db.scalars(select(MapLayer).where(MapLayer.is_active, MapLayer.dataset_id == ds.id))
        ).all()
    }
    attribution = "Bathymetry: GEBCO 2026 Grid (not for navigation)"
    base = f"{api_base}/api/v1/bathymetry"
    sources, style_layers, meta = {}, [], []

    def vis(slug):
        return "visible" if layers[slug].default_visible else "none"

    if "bathymetry-depth" in layers:
        sources["bathymetry-depth"] = {
            "type": "raster",
            "tiles": [f"{base}/tiles/depth/{{z}}/{{x}}/{{y}}.png"],
            "tileSize": 256,
            "minzoom": 4,
            "maxzoom": 10,
            "bounds": BOUNDS,
            "attribution": attribution,
        }
        style_layers.append(
            {
                "id": "bathymetry-depth",
                "type": "raster",
                "source": "bathymetry-depth",
                "layout": {"visibility": vis("bathymetry-depth")},
                "paint": {
                    "raster-opacity": layers["bathymetry-depth"].default_opacity,
                    "raster-fade-duration": 0,
                },
            }
        )
        meta.append(layer_meta(layers["bathymetry-depth"], ["bathymetry-depth"]))
    if "bathymetry-slope" in layers:
        sources["bathymetry-slope"] = {
            "type": "raster",
            "tiles": [f"{base}/tiles/slope/{{z}}/{{x}}/{{y}}.png"],
            "tileSize": 256,
            "minzoom": 4,
            "maxzoom": 10,
            "bounds": BOUNDS,
        }
        style_layers.append(
            {
                "id": "bathymetry-slope",
                "type": "raster",
                "source": "bathymetry-slope",
                "layout": {"visibility": vis("bathymetry-slope")},
                "paint": {
                    "raster-opacity": layers["bathymetry-slope"].default_opacity,
                    "raster-fade-duration": 0,
                },
            }
        )
        meta.append(layer_meta(layers["bathymetry-slope"], ["bathymetry-slope"]))
    if "bathymetry-contours" in layers:
        sources["bathymetry-contours"] = {
            "type": "vector",
            "tiles": [f"{base}/contours/{{z}}/{{x}}/{{y}}.pbf"],
            "minzoom": 4,
            "maxzoom": 12,
            "bounds": BOUNDS,
        }
        style_layers.append(
            {
                "id": "bathymetry-contours",
                "type": "line",
                "source": "bathymetry-contours",
                "source-layer": "contours",
                "layout": {"visibility": vis("bathymetry-contours"), "line-join": "round"},
                "paint": {
                    "line-color": CONTOUR_COLOUR,
                    "line-width": ["interpolate", ["linear"], ["zoom"], 5, 0.6, 10, 1.2, 14, 2.0],
                    "line-opacity": 0.9,
                },
            }
        )
        # Labels are added by the client as icon images (no glyph server needed).
        meta.append(layer_meta(layers["bathymetry-contours"], ["bathymetry-contours"]))
    if "bathymetry-features" in layers:
        sources["bathymetry-features"] = {"type": "geojson", "data": f"{base}/features.geojson"}
        style_layers.append(
            {
                "id": "bathymetry-features",
                "type": "circle",
                "source": "bathymetry-features",
                "minzoom": 6,
                "layout": {"visibility": vis("bathymetry-features")},
                "paint": {
                    "circle-radius": ["interpolate", ["linear"], ["zoom"], 6, 3, 12, 7],
                    "circle-color": [
                        "match",
                        ["get", "kind"],
                        "drop_off",
                        "#ff9800",
                        "seamount",
                        "#e040fb",
                        "knoll",
                        "#7c4dff",
                        "#00e5ff",
                    ],
                    "circle-stroke-color": "#06121f",
                    "circle-stroke-width": 1.5,
                    "circle-opacity": 0.9,
                },
            }
        )
        meta.append(layer_meta(layers["bathymetry-features"], ["bathymetry-features"]))
    return {"sources": sources, "layers": style_layers, "metadata": meta}
