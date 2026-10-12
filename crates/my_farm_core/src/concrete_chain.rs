//! Concrete caller-authored commitments; execution remains in the Farm executor.
use crate::RecipeDef;
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use ts_rs::TS;

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, TS, PartialEq, Eq)]
pub struct ConcreteJobRequest {
    pub id: String,
    pub resident_id: String,
    pub work: ConcreteWork,
    pub after: Vec<String>,
    pub inputs: Vec<ConcreteInput>,
}
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, TS, PartialEq, Eq)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ConcreteWork {
    PlantCrop { plot_id: String, crop_id: String },
    HarvestCrop { plot_id: String },
    StartOvenRecipe { recipe_id: String },
    CollectOvenJob { producer_id: String },
}
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, TS, PartialEq, Eq)]
pub struct ConcreteInput {
    pub item_id: String,
    pub quantity: u32,
    pub source: ConcreteInputSource,
}
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, TS, PartialEq, Eq)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ConcreteInputSource {
    Stored,
    ProducerOutput {
        #[serde(default, skip_serializing_if = "Option::is_none")]
        #[ts(optional)]
        chain_id: Option<String>,
        job_id: String,
    },
    CommittedTaskOutput {
        resident_id: String,
        task_id: String,
    },
}
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, TS, PartialEq, Eq)]
pub struct ConcreteChain {
    pub jobs: BTreeMap<String, ConcreteJob>,
}
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, TS, PartialEq, Eq)]
pub struct ConcreteJob {
    pub resident_id: String,
    pub after: Vec<String>,
    pub inputs: Vec<ConcreteInput>,
    pub task_ids: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub production_job_id: Option<String>,
    pub work: ConcreteWork,
    // Original first-step count distinguishes waiting admission from execution.
    pub initial_step_count: usize,
    pub outputs: Vec<crate::ItemStack>,
    #[serde(default)]
    pub input_claims_released: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub crop_terms: Option<ConcreteCropTerms>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub recipe_terms: Option<ConcreteRecipeTerms>,
}
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, TS, PartialEq, Eq)]
pub struct ConcreteRecipeTerms {
    pub recipe: RecipeDef,
    #[ts(type = "number")]
    pub duration_ms: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, TS, PartialEq, Eq)]
pub struct ConcreteCropTerms {
    pub crop: crate::CropDef,
    #[ts(type = "number")]
    pub duration_ms: i64,
}
