package com.poracode.app.ui.richchat

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Checkbox
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Slider
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.unit.dp
import com.poracode.app.ui.components.PoracodeCard
import com.poracode.app.ui.components.PoracodeSegmentedControl
import com.poracode.app.ui.theme.PoracodeTextStyles
import com.poracode.app.ui.theme.PoracodeTheme
import java.text.NumberFormat
import java.util.Currency
import kotlin.math.abs
import kotlin.math.max
import kotlin.math.min
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.doubleOrNull

/**
 * Native Jetpack Compose parser and renderer for `poracode-visual-v1` and `poracode-visual-v2`
 * interactive data visuals (charts, tables, outputs, calculators, checklists, tabs, text, diagrams).
 */
internal data class NativeVisualDocument(
    val title: String,
    val description: String?,
    val inputs: List<Input>,
    val blocks: List<Block>,
) {
    data class Input(
        val id: String,
        val label: String,
        val min: Double,
        val max: Double,
        val step: Double,
        val defaultValue: Double,
    )

    sealed interface Formula {
        data class Literal(val value: Double) : Formula
        data class InputRef(val id: String) : Formula
        data class Binary(val op: String, val lhs: Formula, val rhs: Formula) : Formula

        fun evaluate(inputs: Map<String, Double>): Double = when (this) {
            is Literal -> value
            is InputRef -> inputs[id] ?: 0.0
            is Binary -> {
                val a = lhs.evaluate(inputs)
                val b = rhs.evaluate(inputs)
                when (op) {
                    "add" -> a + b
                    "subtract" -> a - b
                    "multiply" -> a * b
                    "divide" -> if (b == 0.0) 0.0 else a / b
                    "min" -> min(a, b)
                    "max" -> max(a, b)
                    else -> 0.0
                }
            }
        }
    }

    data class ValueFormat(val style: String, val currency: String? = null) {
        fun format(value: Double): String {
            if (!value.isFinite()) return "—"
            return runCatching {
                when (style) {
                    "percent" -> NumberFormat.getPercentInstance().apply { maximumFractionDigits = 1 }.format(value)
                    "currency" -> NumberFormat.getCurrencyInstance().apply {
                        this@ValueFormat.currency?.let { code -> this.currency = Currency.getInstance(code) }
                    }.format(value)
                    else -> NumberFormat.getNumberInstance().apply { maximumFractionDigits = 2 }.format(value)
                }
            }.getOrElse { "%.2f".format(value) }
        }
    }

    sealed interface CellValue {
        data class TextCell(val text: String) : CellValue
        data class FormulaCell(val formula: Formula) : CellValue
    }

    data class OutputItem(val label: String, val value: Formula, val format: ValueFormat?)
    data class ChartSeries(val label: String, val values: List<Formula>)
    data class ChecklistItem(val id: String, val label: String, val checked: Boolean)
    data class DiagramNode(val id: String, val label: String, val detail: String?, val tone: String?)
    data class DiagramEdge(val from: String, val to: String, val label: String?)
    data class TabItem(val id: String, val label: String, val blocks: List<Block>)

    sealed interface Block {
        data class Outputs(val title: String?, val items: List<OutputItem>) : Block
        data class Table(val title: String?, val columns: List<Pair<String, ValueFormat?>>, val rows: List<List<CellValue>>) : Block
        data class Chart(val kind: String, val title: String?, val labels: List<String>, val series: List<ChartSeries>, val format: ValueFormat?) : Block
        data class TextBlock(val title: String?, val body: String) : Block
        data class Checklist(val title: String?, val items: List<ChecklistItem>) : Block
        data class Diagram(val title: String?, val nodes: List<DiagramNode>, val edges: List<DiagramEdge>) : Block
        data class Tabs(val title: String?, val items: List<TabItem>) : Block
    }

    companion object {
        private val json = Json { ignoreUnknownKeys = true }

        fun parse(language: String, source: String): NativeVisualDocument? {
            if (!(language.startsWith("poracode-visual-v1") || language.startsWith("poracode-visual-v2"))) return null
            if (source.toByteArray(Charsets.UTF_8).size > 64 * 1024) return null
            val root = runCatching { json.parseToJsonElement(source) as? JsonObject }.getOrNull() ?: return null
            val rawBlocks = root["blocks"] as? JsonArray ?: return null
            val blocks = rawBlocks.mapNotNull { parseBlock(it as? JsonObject) }
            if (blocks.isEmpty()) return null
            val title = language.dropWhile { !it.isWhitespace() }.trim()
            val inputs = (root["inputs"] as? JsonArray).orEmpty().mapNotNull { parseInput(it as? JsonObject) }
            return NativeVisualDocument(
                title = title,
                description = root.str("description"),
                inputs = inputs,
                blocks = blocks,
            )
        }

        private fun parseInput(obj: JsonObject?): Input? {
            if (obj == null) return null
            val id = obj.str("id")?.takeIf(String::isNotBlank) ?: return null
            val label = obj.str("label") ?: return null
            val min = obj.num("min") ?: return null
            val max = obj.num("max") ?: return null
            val step = obj.num("step")?.takeIf { it > 0.0 } ?: return null
            val value = obj.num("value") ?: return null
            if (max <= min) return null
            return Input(id, label, min, max, step, value)
        }

        private fun parseFormula(el: JsonElement?): Formula? {
            (el as? JsonPrimitive)?.doubleOrNull?.let { return Formula.Literal(it) }
            val obj = el as? JsonObject ?: return null
            obj.str("input")?.takeIf(String::isNotBlank)?.let { return Formula.InputRef(it) }
            val op = obj.str("op") ?: return null
            val args = obj["args"] as? JsonArray ?: return null
            if (args.size != 2) return null
            val lhs = parseFormula(args[0]) ?: return null
            val rhs = parseFormula(args[1]) ?: return null
            return Formula.Binary(op, lhs, rhs)
        }

        private fun parseFormat(el: JsonElement?): ValueFormat? {
            val obj = el as? JsonObject ?: return null
            val style = obj.str("style") ?: return null
            return ValueFormat(style, obj.str("currency"))
        }

        private fun parseBlock(obj: JsonObject?): Block? {
            if (obj == null) return null
            val title = obj.str("title")
            return when (obj.str("type")) {
                "outputs" -> {
                    val items = (obj["items"] as? JsonArray).orEmpty().mapNotNull { el ->
                        val item = el as? JsonObject ?: return@mapNotNull null
                        val label = item.str("label") ?: return@mapNotNull null
                        val f = parseFormula(item["value"]) ?: return@mapNotNull null
                        OutputItem(label, f, parseFormat(item["format"]))
                    }
                    items.takeIf { it.isNotEmpty() }?.let { Block.Outputs(title, it) }
                }
                "table" -> {
                    val cols = (obj["columns"] as? JsonArray).orEmpty().mapNotNull { el ->
                        val c = el as? JsonObject ?: return@mapNotNull null
                        val label = c.str("label") ?: return@mapNotNull null
                        label to parseFormat(c["format"])
                    }
                    val rows = (obj["rows"] as? JsonArray).orEmpty().mapNotNull { r ->
                        (r as? JsonArray)?.map { cell ->
                            if (cell is JsonPrimitive && cell.isString) CellValue.TextCell(cell.content)
                            else parseFormula(cell)?.let(CellValue::FormulaCell) ?: CellValue.TextCell("")
                        }
                    }
                    cols.takeIf { it.isNotEmpty() }?.let { Block.Table(title, it, rows) }
                }
                "chart" -> {
                    val kind = obj.str("kind") ?: "bar"
                    val labels = (obj["labels"] as? JsonArray).orEmpty().mapNotNull { (it as? JsonPrimitive)?.contentOrNull }
                    val series = (obj["series"] as? JsonArray).orEmpty().mapNotNull { el ->
                        val s = el as? JsonObject ?: return@mapNotNull null
                        val label = s.str("label") ?: return@mapNotNull null
                        val vals = (s["values"] as? JsonArray).orEmpty().mapNotNull(::parseFormula)
                        vals.takeIf { it.isNotEmpty() }?.let { ChartSeries(label, it) }
                    }
                    series.takeIf { it.isNotEmpty() }?.let { Block.Chart(kind, title, labels, it, parseFormat(obj["format"])) }
                }
                "text" -> obj.str("text")?.let { Block.TextBlock(title, it) }
                "checklist" -> {
                    val items = (obj["items"] as? JsonArray).orEmpty().mapNotNull { el ->
                        val item = el as? JsonObject ?: return@mapNotNull null
                        val id = item.str("id") ?: return@mapNotNull null
                        val label = item.str("label") ?: return@mapNotNull null
                        ChecklistItem(id, label, (item["checked"] as? JsonPrimitive)?.booleanOrNull == true)
                    }
                    items.takeIf { it.isNotEmpty() }?.let { Block.Checklist(title, it) }
                }
                "diagram" -> {
                    val nodes = (obj["nodes"] as? JsonArray).orEmpty().mapNotNull { el ->
                        val n = el as? JsonObject ?: return@mapNotNull null
                        val id = n.str("id") ?: return@mapNotNull null
                        val label = n.str("label") ?: return@mapNotNull null
                        DiagramNode(id, label, n.str("detail"), n.str("tone"))
                    }
                    val edges = (obj["edges"] as? JsonArray).orEmpty().mapNotNull { el ->
                        val e = el as? JsonObject ?: return@mapNotNull null
                        val from = e.str("from") ?: return@mapNotNull null
                        val to = e.str("to") ?: return@mapNotNull null
                        DiagramEdge(from, to, e.str("label"))
                    }
                    nodes.takeIf { it.isNotEmpty() }?.let { Block.Diagram(title, it, edges) }
                }
                "tabs" -> {
                    val tabs = (obj["tabs"] as? JsonArray).orEmpty().mapNotNull { el ->
                        val tab = el as? JsonObject ?: return@mapNotNull null
                        val id = tab.str("id") ?: return@mapNotNull null
                        val label = tab.str("label") ?: return@mapNotNull null
                        val sub = (tab["blocks"] as? JsonArray).orEmpty().mapNotNull { parseBlock(it as? JsonObject) }
                        sub.takeIf { it.isNotEmpty() }?.let { TabItem(id, label, it) }
                    }
                    tabs.takeIf { it.isNotEmpty() }?.let { Block.Tabs(title, it) }
                }
                else -> null
            }
        }

        private fun JsonObject.str(key: String): String? =
            (this[key] as? JsonPrimitive)?.takeIf { it.isString }?.content

        private fun JsonObject.num(key: String): Double? =
            (this[key] as? JsonPrimitive)?.doubleOrNull
    }
}

@Composable
internal fun RichNativeVisualView(
    document: NativeVisualDocument,
    rawLanguage: String,
    rawSource: String,
    modifier: Modifier = Modifier,
) {
    val colors = PoracodeTheme.colors
    val inputValues = remember(document) {
        mutableStateMapOf<String, Double>().apply {
            document.inputs.forEach { put(it.id, it.defaultValue) }
        }
    }
    val checkedState = remember(document) { mutableStateMapOf<String, Boolean>() }
    var showSource by remember(document) { mutableStateOf(false) }

    PoracodeCard(modifier = modifier.fillMaxWidth()) {
        Row(
            Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Text(
                document.title.ifBlank { rawLanguage },
                style = PoracodeTextStyles.sheetTitle,
                color = colors.foreground,
                modifier = Modifier.weight(1f),
            )
            TextButton(onClick = { showSource = !showSource }) {
                Text(if (showSource) "Visual" else "JSON")
            }
        }
        document.description?.takeIf(String::isNotBlank)?.let {
            Text(it, style = MaterialTheme.typography.bodySmall, color = colors.muted)
        }
        if (showSource) {
            MarkdownCodeBlock(RichMarkdownBlock.Code(rawLanguage, rawSource))
        } else {
            document.inputs.forEach { input ->
                val current = inputValues[input.id] ?: input.defaultValue
                Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                        Text(input.label, style = PoracodeTextStyles.rowDescription, color = colors.muted)
                        Text("%.2f".format(current).trimEnd('0').trimEnd('.'), style = PoracodeTextStyles.rowTitle)
                    }
                    Slider(
                        value = current.toFloat().coerceIn(input.min.toFloat(), input.max.toFloat()),
                        onValueChange = { inputValues[input.id] = it.toDouble() },
                        valueRange = input.min.toFloat()..input.max.toFloat(),
                    )
                }
            }
            document.blocks.forEach { block ->
                RenderNativeVisualBlock(block, inputValues, checkedState)
            }
        }
    }
}

@Composable
private fun RenderNativeVisualBlock(
    block: NativeVisualDocument.Block,
    inputs: Map<String, Double>,
    checkedState: MutableMap<String, Boolean>,
) {
    val colors = PoracodeTheme.colors
    when (block) {
        is NativeVisualDocument.Block.Outputs -> {
            block.title?.let { Text(it, style = PoracodeTextStyles.rowTitle, fontWeight = FontWeight.SemiBold) }
            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                block.items.forEach { item ->
                    val v = item.value.evaluate(inputs)
                    val formatted = item.format?.format(v) ?: "%.2f".format(v).trimEnd('0').trimEnd('.')
                    Row(
                        Modifier
                            .fillMaxWidth()
                            .clip(RoundedCornerShape(8.dp))
                            .background(MaterialTheme.colorScheme.surfaceContainerHigh)
                            .padding(horizontal = 10.dp, vertical = 8.dp),
                        horizontalArrangement = Arrangement.SpaceBetween,
                    ) {
                        Text(item.label, style = MaterialTheme.typography.bodySmall, color = colors.muted)
                        Text(formatted, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
                    }
                }
            }
        }
        is NativeVisualDocument.Block.Table -> {
            block.title?.let { Text(it, style = PoracodeTextStyles.rowTitle, fontWeight = FontWeight.SemiBold) }
            Column(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState())) {
                Row(horizontalArrangement = Arrangement.spacedBy(12.dp), modifier = Modifier.padding(vertical = 4.dp)) {
                    block.columns.forEach { (label, _) ->
                        Text(label, style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.SemiBold, modifier = Modifier.widthIn(min = 84.dp))
                    }
                }
                HorizontalDivider(color = colors.separator)
                block.rows.forEach { row ->
                    Row(horizontalArrangement = Arrangement.spacedBy(12.dp), modifier = Modifier.padding(vertical = 4.dp)) {
                        block.columns.forEachIndexed { idx, (_, fmt) ->
                            val cellText = when (val cell = row.getOrNull(idx)) {
                                is NativeVisualDocument.CellValue.TextCell -> cell.text
                                is NativeVisualDocument.CellValue.FormulaCell -> {
                                    val v = cell.formula.evaluate(inputs)
                                    fmt?.format(v) ?: "%.2f".format(v).trimEnd('0').trimEnd('.')
                                }
                                null -> ""
                            }
                            Text(cellText, style = MaterialTheme.typography.bodySmall, modifier = Modifier.widthIn(min = 84.dp))
                        }
                    }
                }
            }
        }
        is NativeVisualDocument.Block.Chart -> {
            block.title?.let { Text(it, style = PoracodeTextStyles.rowTitle, fontWeight = FontWeight.SemiBold) }
            val maxVal = max(block.series.flatMap { s -> s.values.map { abs(it.evaluate(inputs)) } }.maxOrNull() ?: 1.0, 0.0001)
            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                block.series.forEach { series ->
                    Text(series.label, style = PoracodeTextStyles.rowDescription, color = colors.muted)
                    series.values.forEachIndexed { idx, formula ->
                        val v = formula.evaluate(inputs)
                        val fraction = (abs(v) / maxVal).toFloat().coerceIn(0.02f, 1f)
                        val label = block.labels.getOrNull(idx) ?: "#${idx + 1}"
                        Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                                Text(label, style = PoracodeTextStyles.rowMeta)
                                Text(block.format?.format(v) ?: "%.2f".format(v).trimEnd('0').trimEnd('.'), style = PoracodeTextStyles.rowMeta)
                            }
                            Box(
                                Modifier
                                    .fillMaxWidth(fraction)
                                    .height(8.dp)
                                    .clip(RoundedCornerShape(4.dp))
                                    .background(colors.accent),
                            )
                        }
                    }
                }
            }
        }
        is NativeVisualDocument.Block.TextBlock -> {
            block.title?.let { Text(it, style = PoracodeTextStyles.rowTitle, fontWeight = FontWeight.SemiBold) }
            Text(block.body, style = MaterialTheme.typography.bodySmall)
        }
        is NativeVisualDocument.Block.Checklist -> {
            block.title?.let { Text(it, style = PoracodeTextStyles.rowTitle, fontWeight = FontWeight.SemiBold) }
            Column {
                block.items.forEach { item ->
                    val checked = checkedState[item.id] ?: item.checked
                    Row(
                        Modifier.fillMaxWidth().clickable { checkedState[item.id] = !checked },
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Checkbox(checked = checked, onCheckedChange = { checkedState[item.id] = it })
                        Text(
                            item.label,
                            style = MaterialTheme.typography.bodySmall,
                            textDecoration = if (checked) TextDecoration.LineThrough else TextDecoration.None,
                            color = if (checked) colors.muted else colors.foreground,
                        )
                    }
                }
            }
        }
        is NativeVisualDocument.Block.Diagram -> {
            block.title?.let { Text(it, style = PoracodeTextStyles.rowTitle, fontWeight = FontWeight.SemiBold) }
            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                block.nodes.forEach { node ->
                    Column(
                        Modifier
                            .fillMaxWidth()
                            .clip(RoundedCornerShape(8.dp))
                            .background(MaterialTheme.colorScheme.surfaceContainerHigh)
                            .padding(8.dp),
                    ) {
                        Text(node.label, style = PoracodeTextStyles.rowTitle, fontWeight = FontWeight.SemiBold)
                        node.detail?.takeIf(String::isNotBlank)?.let {
                            Text(it, style = PoracodeTextStyles.rowMeta, color = colors.muted)
                        }
                    }
                }
                block.edges.forEach { edge ->
                    val fromLabel = block.nodes.firstOrNull { it.id == edge.from }?.label ?: edge.from
                    val toLabel = block.nodes.firstOrNull { it.id == edge.to }?.label ?: edge.to
                    val suffix = edge.label?.let { " ($it)" }.orEmpty()
                    Text("$fromLabel → $toLabel$suffix", style = PoracodeTextStyles.rowMeta, color = colors.muted)
                }
            }
        }
        is NativeVisualDocument.Block.Tabs -> {
            block.title?.let { Text(it, style = PoracodeTextStyles.rowTitle, fontWeight = FontWeight.SemiBold) }
            var selectedIdx by remember(block) { mutableStateOf(0) }
            PoracodeSegmentedControl(
                options = block.items.map { it.label },
                selectedIndex = selectedIdx.coerceIn(0, block.items.lastIndex),
                onSelect = { selectedIdx = it },
                modifier = Modifier.fillMaxWidth(),
            )
            block.items.getOrNull(selectedIdx)?.blocks?.forEach { sub ->
                RenderNativeVisualBlock(sub, inputs, checkedState)
            }
        }
    }
}
