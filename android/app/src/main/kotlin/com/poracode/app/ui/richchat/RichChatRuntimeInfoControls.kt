package com.poracode.app.ui.richchat

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.CheckCircle
import androidx.compose.material.icons.outlined.ErrorOutline
import androidx.compose.material.icons.outlined.RadioButtonUnchecked
import androidx.compose.material.icons.outlined.WarningAmber
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.unit.dp
import com.poracode.app.R
import com.poracode.app.model.AgentStatusEntry

@Composable
internal fun RichDelegatedAgentsCard(
    agents: List<RichDelegatedAgentPresentation>,
    modifier: Modifier = Modifier,
) {
    if (agents.isEmpty()) return
    Card(modifier.fillMaxWidth()) {
        Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            agents.forEach { agent ->
                Row(
                    Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    CircularProgressIndicator(Modifier.size(18.dp), strokeWidth = 2.dp)
                    Column(Modifier.weight(1f)) {
                        Text(agent.title, style = MaterialTheme.typography.titleSmall)
                        Text(
                            delegatedAgentLabel(agent.kind),
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.primary,
                        )
                        if (agent.activityCount > 0) {
                            Text(
                                stringResource(R.string.rich_chat_activity_count, agent.activityCount),
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
internal fun RichAuthenticationRequiredCard(
    agentStatus: AgentStatusEntry,
    onOpenAgentSettings: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Card(
        modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.tertiaryContainer,
            contentColor = MaterialTheme.colorScheme.onTertiaryContainer,
        ),
    ) {
        Row(
            Modifier.padding(12.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Icon(Icons.Outlined.WarningAmber, contentDescription = null)
            Column(Modifier.weight(1f)) {
                Text(
                    stringResource(R.string.rich_chat_sign_in_required),
                    style = MaterialTheme.typography.titleSmall,
                )
                Text(
                    agentStatus.label.ifBlank { agentStatus.kind },
                    style = MaterialTheme.typography.bodySmall,
                )
            }
            OutlinedButton(onClick = onOpenAgentSettings) {
                Text(stringResource(R.string.rich_chat_agent_settings))
            }
        }
    }
}

@Composable
internal fun RichPlanCard(
    plan: RichPlanPresentation,
    modifier: Modifier = Modifier,
) {
    Card(modifier.fillMaxWidth()) {
        Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text(stringResource(R.string.rich_chat_plan), style = MaterialTheme.typography.titleSmall)
            plan.steps.forEach { step ->
                val status = planStepStatusLabel(step.status)
                val stepDescription = stringResource(
                    R.string.rich_chat_plan_step_description,
                    step.text,
                    status,
                )
                Row(
                    Modifier
                        .fillMaxWidth()
                        .clearAndSetSemantics {
                            contentDescription = stepDescription
                        },
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    when (step.status) {
                        RichPlanStepStatus.Completed -> Icon(
                            Icons.Outlined.CheckCircle,
                            contentDescription = null,
                            tint = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                        RichPlanStepStatus.InProgress -> CircularProgressIndicator(
                            Modifier.size(20.dp),
                            strokeWidth = 2.dp,
                        )
                        RichPlanStepStatus.Pending -> Icon(
                            Icons.Outlined.RadioButtonUnchecked,
                            contentDescription = null,
                            tint = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                    Text(
                        step.text,
                        modifier = Modifier.weight(1f),
                        style = MaterialTheme.typography.bodySmall,
                        color = if (step.status == RichPlanStepStatus.Completed) {
                            MaterialTheme.colorScheme.onSurfaceVariant
                        } else {
                            MaterialTheme.colorScheme.onSurface
                        },
                        textDecoration = if (step.status == RichPlanStepStatus.Completed) {
                            TextDecoration.LineThrough
                        } else {
                            TextDecoration.None
                        },
                    )
                }
            }
        }
    }
}

@Composable
internal fun RichErrorsCard(
    errors: List<RichRuntimeErrorPresentation>,
    modifier: Modifier = Modifier,
) {
    if (errors.isEmpty()) return
    Card(
        modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.errorContainer,
            contentColor = MaterialTheme.colorScheme.onErrorContainer,
        ),
    ) {
        Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Outlined.ErrorOutline, contentDescription = null)
                Text(
                    stringResource(R.string.rich_chat_errors),
                    modifier = Modifier.padding(start = 8.dp),
                    style = MaterialTheme.typography.titleSmall,
                )
            }
            SelectionContainer {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    errors.forEach { error ->
                        Text(error.message, style = MaterialTheme.typography.bodySmall)
                    }
                }
            }
        }
    }
}

@Composable
private fun delegatedAgentLabel(kind: RichDelegatedAgentKind): String = stringResource(
    when (kind) {
        RichDelegatedAgentKind.Subagent -> R.string.rich_chat_subagent
        RichDelegatedAgentKind.Crossagent -> R.string.rich_chat_crossagent
        RichDelegatedAgentKind.Workflow -> R.string.rich_chat_workflow
    },
)

@Composable
private fun planStepStatusLabel(status: RichPlanStepStatus): String = stringResource(
    when (status) {
        RichPlanStepStatus.Pending -> R.string.rich_chat_plan_pending
        RichPlanStepStatus.InProgress -> R.string.rich_chat_plan_in_progress
        RichPlanStepStatus.Completed -> R.string.rich_chat_plan_completed
    },
)
